#!/usr/bin/env node
// Probe Codex subscription models through the Codex responses endpoint.
// /backend-api/models is not a catalog: an authenticated call returns only
// session extras. Availability comes from this probe.
// The credential field is `access`. The script never prints that value.
// The request sets stream:true and does not send max_output_tokens.
// HTTP 400 => available false.
// HTTP 200 and the response model matches => available true.
// HTTP 200 and the response model differs => available true plus servedModel.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const availability = JSON.parse(
  readFileSync(new URL("../src/host/oauth-catalogs/openai-codex.json", import.meta.url), "utf8"),
);
const CANDIDATES = availability.models.map((model) => model.id);
const LIVE_SETTINGS = join(homedir(), ".dsh", "settings.yaml");

const effortFlag = process.argv.indexOf("--effort");
const effort =
  effortFlag >= 0 && process.argv[effortFlag + 1] === "none" ? "none" : undefined;
const confirm = process.argv.includes("--confirm");
if (!confirm) {
  console.log(
    JSON.stringify({
      live: false,
      effort: effort ?? null,
      candidates: availability.models.map((model) => ({
        id: model.id,
        ...(model.name ? { name: model.name } : {}),
        ...(model.efforts ? { efforts: model.efforts } : {}),
        ...(model.pendingProbe ? { pendingProbe: true } : {}),
      })),
    }),
  );
  process.exit(0);
}

const answer = await new Promise((resolve) => {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  rl.question("Type yes to send Codex responses probes: ", (line) => {
    rl.close();
    resolve(line.trim());
  });
});
if (answer !== "yes") {
  console.error("Probe cancelled.");
  process.exit(2);
}

const PROBE = String.raw`
import json, sys, re
from pathlib import Path
import urllib.request, urllib.error
import yaml

path, raw_ids = sys.argv[1], sys.argv[2]
ids = json.loads(raw_ids)
doc = yaml.safe_load(Path(path).read_text())
records = doc.get("records") if isinstance(doc, dict) else None
record = records.get("llm-pi-ai/openai-codex") if isinstance(records, dict) else None
payload = record.get("payload") if isinstance(record, dict) else None
token = payload.get("access") if isinstance(payload, dict) else None
if not isinstance(token, str) or token.count(".") != 2:
    sys.stderr.write("credential access field is missing\n")
    sys.exit(1)
payload_json = json.loads(__import__("base64").urlsafe_b64decode(token.split(".")[1] + "=="))
account = ((payload_json.get("https://api.openai.com/auth") or {}).get("chatgpt_account_id"))
if not isinstance(account, str) or not account:
    sys.stderr.write("chatgpt account id is missing\n")
    sys.exit(1)

def scrub(text):
    text = re.sub(r"eyJ[A-Za-z0-9_-]{8,}", "[redacted]", text)
    text = re.sub(r"\bsk-[A-Za-z0-9]{4,}", "[redacted]", text)
    text = re.sub(r"access_token[=:][^\s\"']+", "access_token=[redacted]", text)
    text = re.sub(r"refresh_token[=:][^\s\"']+", "refresh_token=[redacted]", text)
    return text[:180]

results = []
for model in ids:
    body = {
        "model": model,
        "store": False,
        "stream": True,
        "instructions": "Reply with exactly the word ok.",
        "input": [{"role": "user", "content": [{"type": "input_text", "text": "Reply with exactly the word ok."}]}],
        "text": {"verbosity": "low"},
    }
    effort = ${JSON.stringify(effort ?? null)}
    if effort:
        body["reasoning"] = {"effort": effort}
    if "max_output_tokens" in body:
        raise SystemExit("max_output_tokens must not be sent")
    request = urllib.request.Request(
        "https://chatgpt.com/backend-api/codex/responses",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": "Bearer " + token,
            "chatgpt-account-id": account,
            "accept": "text/event-stream",
            "content-type": "application/json",
            "OpenAI-Beta": "responses=experimental",
        },
        method="POST",
    )
    status = 0
    served = None
    error = ""
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            status = response.status
            chunk = response.read(65536).decode("utf-8", "replace")
            found = re.search(r'"model"\s*:\s*"([^"]+)"', chunk)
            served = found.group(1) if found else None
    except urllib.error.HTTPError as exc:
        status = exc.code
        error = scrub(exc.read(4096).decode("utf-8", "replace"))
    except Exception as exc:
        error = scrub(str(exc))
    item = {"model": model, "status": status, "available": False}
    if status == 400:
        item["error"] = error
    elif status == 200 and served == model:
        item["available"] = True
    elif status == 200 and served and served != model:
        item["available"] = True
        item["servedModel"] = served
    else:
        item["error"] = error or "response had no model field"
    results.append(item)
json.dump(results, sys.stdout)
`;

const before = createHash("sha256").update(readFileSync(LIVE_SETTINGS)).digest("hex");
const run = spawnSync(
  "python3",
  ["-c", PROBE, join(homedir(), ".dsh", ".credentials.yaml"), JSON.stringify(CANDIDATES)],
  { encoding: "utf8" },
);
const after = createHash("sha256").update(readFileSync(LIVE_SETTINGS)).digest("hex");
if (run.status !== 0) {
  console.error(scrub(run.stderr || "probe failed"));
  process.exit(run.status || 1);
}
const results = JSON.parse(run.stdout);
const out = join(process.cwd(), "artifacts");
mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "probe-codex-output.json"),
  JSON.stringify(
    {
      candidates: results,
      liveSettingsUnchanged: before === after,
    },
    null,
    2,
  ) + "\n",
);
for (const item of results) {
  console.log(
    `${item.model} status=${item.status} available=${item.available}` +
      (item.servedModel ? ` served=${item.servedModel}` : ""),
  );
}
console.log(before === after ? "live settings unchanged" : "LIVE_SETTINGS_CHANGED");

function scrub(text) {
  return text
    .replace(/eyJ[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\bsk-[A-Za-z0-9]{4,}/g, "[redacted]")
    .replace(/access_token[=:][^\s"']+/g, "access_token=[redacted]")
    .replace(/refresh_token[=:][^\s"']+/g, "refresh_token=[redacted]")
    .replace(/\?token=[^\s]+/g, "?token=[redacted]");
}
