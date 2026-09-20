import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import type { Manager } from "./providers.js";
import { SafeError } from "../shared/protocol.js";
/** The credential seam cannot cancel storage reads; release this HTTP owner on abort.
 * Promise.race attaches rejection handlers to late completion as well.
 */
async function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let stop: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    stop = () => reject(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", stop);
  }
}
export function loopback(address: string | undefined) {
  if (!address) return false;
  if (address === "::1") return true;
  if (address.startsWith("::ffff:")) address = address.slice(7);
  return isIP(address) === 4 && address.startsWith("127.");
}
export function createRevealHandler(
  manager: Manager,
  reject: (req: IncomingMessage) => 401 | 403 | undefined,
  lifetime: AbortSignal,
  timeoutMs = 10000,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const send = (status: number, body: unknown) => {
      if (!res.writableEnded && !res.destroyed && !lifetime.aborted) {
        res.statusCode = status;
        res.end(JSON.stringify(body));
      }
    };
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      controller?.abort();
      if (lifetime.aborted) {
        req.destroy();
        res.destroy();
      }
    };
    const closed = () => {
      if (!res.writableEnded) abort();
    };
    try {
      const rejection = reject(req);
      if (rejection) {
        send(rejection, { error: "UNAUTHORIZED" });
        return;
      }
      const host = req.headers.host;
      const origin = req.headers.origin;
      const protocol = (req.socket as { encrypted?: boolean } | undefined)
        ?.encrypted
        ? "https:"
        : "http:";
      let url: URL;
      try {
        url = new URL(protocol + "//" + host);
      } catch {
        send(403, { error: "UNAUTHORIZED" });
        return;
      }
      const port = url.port || (protocol === "https:" ? "443" : "80");
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      if (
        !loopback(req.socket?.remoteAddress) ||
        !(hostname === "localhost" || loopback(hostname)) ||
        String(req.socket.localPort) !== port ||
        !host ||
        url.host !== host ||
        !origin ||
        origin === "null" ||
        origin !== protocol + "//" + host
      ) {
        send(403, { error: "UNAUTHORIZED" });
        return;
      }
      if (req.url !== "/provider-manager/reveal") {
        send(400, { error: "INVALID_INPUT" });
        return;
      }
      if (req.method !== "POST") {
        send(405, { error: "INVALID_INPUT" });
        return;
      }
      if (
        !/^application\/json(?:\s*;.*)?$/i.test(
          req.headers["content-type"] ?? "",
        )
      ) {
        send(415, { error: "INVALID_INPUT" });
        return;
      }
      controller = new AbortController();
      lifetime.addEventListener("abort", abort, { once: true });
      req.once("aborted", abort);
      res.once("close", closed);
      timer = setTimeout(() => {
        controller?.abort();
        res.once("finish", () => req.destroy());
        send(503, { error: "TIMEOUT" });
      }, timeoutMs);
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        controller.signal.throwIfAborted();
        size += Buffer.byteLength(chunk);
        if (size > 4096) {
          send(413, { error: "INVALID_INPUT" });
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        throw new SafeError("INVALID_INPUT");
      }
      const value = await untilAborted(
        manager.reveal(payload, controller.signal),
        controller.signal,
      );
      controller.signal.throwIfAborted();
      send(200, value);
    } catch (e) {
      if (!lifetime.aborted && !req.aborted) {
        const code =
          e instanceof SafeError
            ? e.code
            : controller?.signal.aborted
              ? "TIMEOUT"
              : "UNAVAILABLE";
        send(
          code === "INVALID_INPUT"
            ? 400
            : code === "REF_NOT_ALLOWED"
              ? 403
              : code === "BINDING_CHANGED"
                ? 409
                : 503,
          { error: code },
        );
      }
    } finally {
      if (timer) clearTimeout(timer);
      lifetime.removeEventListener("abort", abort);
      req.off("aborted", abort);
      res.off("close", closed);
    }
  };
}
