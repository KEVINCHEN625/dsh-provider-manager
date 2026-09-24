import { AuthorizationDeclinedError } from "@deepseek-ai/dsh-authorization";
import type { AuthorizationSession } from "@deepseek-ai/dsh-authorization";
import {
  MUSE_CLIENT_ID,
  MUSE_DEVICE_URL,
  MUSE_GRANT,
  MUSE_MINT_URL,
  MUSE_POLL_LIMIT_MS,
  MUSE_POLL_MS,
  MUSE_TOKEN_URL,
} from "./catalog.js";

export interface MuseCredential {
  access: string;
  email?: string;
  name?: string;
}

export interface MuseDeviceDeps {
  fetch?: typeof fetch;
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  deviceUrl?: string;
  tokenUrl?: string;
  mintUrl?: string;
}

export async function runMuseDeviceFlow(
  session: AuthorizationSession,
  deps: MuseDeviceDeps = {},
): Promise<MuseCredential> {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const wait = deps.wait ?? delay;
  const started = await postForm(
    fetchImpl,
    deps.deviceUrl ?? MUSE_DEVICE_URL,
    { client_id: MUSE_CLIENT_ID },
    session.signal,
  );
  const deviceCode = text(started.device_code);
  const userCode = text(started.user_code);
  const url = text(started.verification_uri_complete) || text(started.verification_uri);
  if (!deviceCode || !userCode || !url)
    throw new Error("Muse device authorization did not return a code");
  session.notify({
    message: "Open the Muse page and enter the code.",
    url,
    code: userCode,
  });
  const deadline = now() + limitMs(started.expires_in);
  let interval = Math.max(1_000, number(started.interval) || MUSE_POLL_MS);
  while (now() < deadline) {
    await wait(interval, session.signal);
    const token = await postForm(
      fetchImpl,
      deps.tokenUrl ?? MUSE_TOKEN_URL,
      {
        grant_type: MUSE_GRANT,
        device_code: deviceCode,
        client_id: MUSE_CLIENT_ID,
      },
      session.signal,
    );
    const error = text(token.error);
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      interval += MUSE_POLL_MS;
      continue;
    }
    if (error === "access_denied" || error === "expired_token")
      throw new AuthorizationDeclinedError(error);
    const access = text(token.access_token);
    if (!access) throw new Error("Muse token response had no access token");
    const minted = await mintKey(
      fetchImpl,
      deps.mintUrl ?? MUSE_MINT_URL,
      access,
      session.signal,
    );
    return {
      access: minted.access || access,
      ...(minted.email ? { email: minted.email } : {}),
      ...(minted.name ? { name: minted.name } : {}),
    };
  }
  throw new AuthorizationDeclinedError("expired_token");
}

async function mintKey(
  fetchImpl: typeof fetch,
  url: string,
  access: string,
  signal: AbortSignal,
): Promise<{ access?: string; email?: string; name?: string }> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${access}`,
        "content-type": "application/json",
        "user-agent": "muse-code/1.0.2",
      },
      body: JSON.stringify({ dca_token: access }),
    });
    if (!response.ok) return {};
    const body = (await response.json()) as Record<string, unknown>;
    return {
      access: text(body.api_key),
      email: text(body.user_email),
      name: text(body.user_full_name),
    };
  } catch (error) {
    if (signal.aborted) throw error;
    return {};
  }
}

async function postForm(
  fetchImpl: typeof fetch,
  url: string,
  fields: Record<string, string>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, {
    method: "POST",
    signal,
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "muse-code/1.0.2",
    },
    body: new URLSearchParams(fields),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok && !text(body.error))
    throw new Error("Muse authorization request failed");
  return body;
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError() {
  return new DOMException("The operation was aborted", "AbortError");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value * 1000 : 0;
}

function limitMs(expiresIn: unknown) {
  const seconds = typeof expiresIn === "number" ? expiresIn * 1000 : MUSE_POLL_LIMIT_MS;
  return Math.min(Math.max(seconds, 1_000), MUSE_POLL_LIMIT_MS);
}
