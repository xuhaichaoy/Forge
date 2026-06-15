import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 5178;
const url = `http://${host}:${port}/`;

const existing = await fetchText(url).catch(() => null);
if (existing !== null) {
  if (existing.includes("Forge") || existing.includes("/src/main.tsx")) {
    console.log(`Reusing existing Forge Vite dev server at ${url}`);
    process.exit(0);
  }
  console.error(`Port ${port} is already serving a different app. Stop that process or change Forge devUrl.`);
  process.exit(1);
}

const child = spawn("npm", ["run", "dev:server"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: "inherit",
  // `npm` is npm.cmd on Windows; Node >=20.12 needs a shell to spawn it.
  shell: process.platform === "win32",
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

function fetchText(target) {
  return new Promise((resolve, reject) => {
    const request = http.get(target, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    });
    request.setTimeout(800, () => {
      request.destroy(new Error("timeout"));
    });
    request.on("error", reject);
  });
}
