#!/usr/bin/env node
// Single-command dev orchestrator: starts the Fluid relay (tinylicious),
// the service, and the client together, with prefixed output and graceful
// shutdown. Replaces `pnpm run "/regex/"`, which proved unreliable for
// long-lived servers (nested pnpm + tsx watch could hang / orphan processes).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, delimiter } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serviceDir = resolve(root, "packages/service");
const clientDir = resolve(root, "packages/client");

const COLORS = { relay: "\x1b[35m", service: "\x1b[36m", client: "\x1b[32m" };
const RESET = "\x1b[0m";

/** Prepend root + package-local node_modules/.bin so workspace bins resolve. */
function binPath(cwd) {
  return (
    resolve(cwd, "node_modules/.bin") +
    delimiter +
    resolve(root, "node_modules/.bin") +
    delimiter +
    (process.env.PATH ?? "")
  );
}

/** @type {{name:string,command:string,cwd:string,env?:Record<string,string>}[]} */
const targets = [
  // tinylicious reads PORT; pin it to 7070 (must match TINYLICIOUS_PORT in .env).
  { name: "relay", command: "tinylicious", cwd: serviceDir, env: { PORT: "7070" } },
  { name: "service", command: "tsx watch src/index.ts", cwd: serviceDir },
  { name: "client", command: "vite", cwd: clientDir },
];

const children = [];
let shuttingDown = false;

function prefix(name, color, chunk) {
  const tag = `${color}[${name}]${RESET} `;
  return (
    chunk
      .toString()
      .split(/\r?\n/)
      .filter((l, i, a) => l.length > 0 || i < a.length - 1)
      .map((l) => tag + l)
      .join("\n") + "\n"
  );
}

for (const t of targets) {
  const color = COLORS[t.name] ?? "";
  // Pass the whole command as one string with shell:true so the workspace
  // .bin shims (tinylicious/tsx/vite) resolve via the augmented PATH.
  const child = spawn(t.command, {
    cwd: t.cwd,
    env: { ...process.env, ...t.env, PATH: binPath(t.cwd) },
    shell: true,
  });
  children.push(child);
  child.stdout.on("data", (d) => process.stdout.write(prefix(t.name, color, d)));
  child.stderr.on("data", (d) => process.stderr.write(prefix(t.name, color, d)));
  child.on("exit", (code) => {
    process.stdout.write(prefix(t.name, color, `exited with code ${code}`));
    if (!shuttingDown) shutdown(code ?? 0);
  });
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (!c.killed) c.kill();
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(
  "Starting relay (7070), service (8787), client (5990)… (Ctrl+C to stop all)\n" +
    "Note: the external SubstrateLLMProvider proxy (23671) must be started separately.",
);
