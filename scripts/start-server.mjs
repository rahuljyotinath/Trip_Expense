import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextCli = join(projectDir, "node_modules", "next", "dist", "bin", "next");
const projectKey = createHash("sha256").update(realpathSync(projectDir)).digest("hex").slice(0, 16);
const lockDir = join(tmpdir(), `tripzy-dev-${projectKey}.lock`);
const ownerFile = join(lockDir, "owner.json");
const nextLockFile = join(projectDir, ".next", "dev", "lock");
const ownerToken = `${process.pid}-${Date.now()}-${Math.random()}`;
const preferredPort = 43217;
let ownsLock = false;
let runningChild;
let stopping = false;

function readOwner() {
  try {
    return JSON.parse(readFileSync(ownerFile, "utf8"));
  } catch {
    return null;
  }
}

function readNextOwner() {
  try {
    return JSON.parse(readFileSync(nextLockFile, "utf8"));
  } catch {
    return null;
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function writeOwner(port = null) {
  const temporaryFile = join(lockDir, `owner-${ownerToken}.tmp`);
  writeFileSync(temporaryFile, JSON.stringify({ pid: process.pid, token: ownerToken, port }));
  renameSync(temporaryFile, ownerFile);
}

function releaseLock() {
  if (ownsLock && readOwner()?.token === ownerToken) {
    rmSync(lockDir, { recursive: true, force: true });
  }
  ownsLock = false;
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function acquireLock() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      mkdirSync(lockDir);
      ownsLock = true;
      writeOwner();
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }

    let owner = readOwner();
    if (!owner) {
      await wait(300);
      owner = readOwner();
    }
    if (owner && processIsRunning(owner.pid)) {
      const location = owner.port ? ` at http://127.0.0.1:${owner.port}` : " (starting up)";
      console.log(`Tripzy is already running${location}.`);
      return false;
    }
    let lockAge = Infinity;
    try {
      lockAge = Date.now() - statSync(lockDir).mtimeMs;
    } catch {
      continue;
    }
    if (!owner && lockAge < 3000) {
      console.log("Tripzy is already starting up.");
      return false;
    }

    // The previous launcher exited without cleaning up its lock.
    if (readOwner()?.token !== owner?.token) continue;
    rmSync(lockDir, { recursive: true, force: true });
  }
  throw new Error("Could not acquire the Tripzy server lock. Try again.");
}

function probePort(port) {
  return new Promise((resolveProbe, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (port !== 0 && (error.code === "EADDRINUSE" || error.code === "EACCES")) {
        resolveProbe(null);
      } else {
        reject(error);
      }
    });
    server.listen(port, "127.0.0.1", () => {
      const chosenPort = server.address().port;
      server.close((error) => error ? reject(error) : resolveProbe(chosenPort));
    });
  });
}

async function choosePort(usePreferred) {
  if (usePreferred && await probePort(preferredPort)) return preferredPort;
  return probePort(0);
}

function runNext(port) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [nextCli, "dev", "--port", String(port), "--hostname", "127.0.0.1"], {
      cwd: projectDir,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    runningChild = child;
    let output = "";
    for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on("data", (chunk) => {
        output = (output + chunk.toString()).slice(-8000);
        destination.write(chunk);
      });
    }
    child.on("error", (error) => {
      output += `\n${error.message}`;
      console.error(error.message);
    });
    child.on("close", (code, signal) => {
      runningChild = undefined;
      resolveRun({ code, signal, output });
    });
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    if (runningChild) runningChild.kill(process.platform === "win32" ? "SIGTERM" : signal);
  });
}
process.on("exit", releaseLock);

async function main() {
  if (!existsSync(nextCli)) {
    throw new Error("Next.js is not installed. Run npm install first.");
  }
  const existingServer = readNextOwner();
  if (existingServer && processIsRunning(existingServer.pid)) {
    const location = existingServer.appUrl ?? `http://127.0.0.1:${existingServer.port}`;
    console.log(`Tripzy is already running at ${location}.`);
    return;
  }
  if (!await acquireLock()) return;

  for (let attempt = 0; attempt < 5 && !stopping; attempt += 1) {
    const port = await choosePort(attempt === 0);
    writeOwner(port);
    console.log(`Starting Tripzy at http://127.0.0.1:${port}`);
    const result = await runNext(port);
    if (stopping) return;
    if (result.output.includes("EADDRINUSE")) {
      console.log("That port was taken during startup; trying another.");
      continue;
    }
    process.exitCode = result.code ?? 1;
    return;
  }
  if (!stopping) throw new Error("Could not find a free port after several attempts.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(releaseLock);
