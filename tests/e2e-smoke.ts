import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 3100;
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn("npm", ["start", "--", "-p", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port) },
});

let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
child.stderr.on("data", (chunk) => { logs += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not start. Logs:\n${logs}`);
}

try {
  await waitForServer();

  const login = await fetch(`${baseUrl}/login`, { redirect: "manual" });
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Masuk|Login/i);

  const school = await fetch(`${baseUrl}/school`, { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(school.status));
  assert.match(school.headers.get("location") ?? "", /login/);

  const guardian = await fetch(`${baseUrl}/guardian`, { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(guardian.status));
  assert.match(guardian.headers.get("location") ?? "", /login/);

  const platform = await fetch(`${baseUrl}/platform`, { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(platform.status));
  assert.match(platform.headers.get("location") ?? "", /login|\/$/);

  console.log("E2E smoke passed: login renders and protected workspaces redirect anonymous users.");
} finally {
  child.kill("SIGTERM");
}
