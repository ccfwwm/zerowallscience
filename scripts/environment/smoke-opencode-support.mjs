import { once } from "node:events";
import { rm } from "node:fs/promises";

const CHILD_ENV_ALLOW_LIST = [
  "APPDATA",
  "COMSPEC",
  "HOME",
  "LANG",
  "LOCALAPPDATA",
  "OS",
  "PATH",
  "PATHEXT",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR",
];

export function buildChildEnv(source, overrides) {
  const result = {};
  for (const name of CHILD_ENV_ALLOW_LIST) {
    if (typeof source[name] === "string" && source[name].length > 0) {
      result[name] = source[name];
    }
  }
  return { ...result, ...overrides };
}

export function extractSseFrames(buffer) {
  const frames = [];
  let remaining = buffer;
  while (true) {
    const match = /\r?\n\r?\n/.exec(remaining);
    if (!match) break;
    frames.push(remaining.slice(0, match.index));
    remaining = remaining.slice(match.index + match[0].length);
  }
  return { frames, remaining };
}

export function eventBelongsToSession(payload, sessionId) {
  const properties = payload?.properties ?? {};
  const eventSession =
    properties.sessionID ?? properties.part?.sessionID ?? properties.info?.sessionID;
  return eventSession === sessionId;
}

export function createAbortableRequest(
  request,
  timeoutMs,
  activeControllers = new Set(),
  timeoutMessage = "request timed out",
  mapResponse,
) {
  return async (input, init = {}) => {
    const controller = new AbortController();
    let timedOut = false;
    const requestTimeoutMs = typeof timeoutMs === "function" ? timeoutMs() : timeoutMs;
    activeControllers.add(controller);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);
    try {
      const response = await request(input, { ...init, signal: controller.signal });
      return mapResponse ? await mapResponse(response) : response;
    } catch (error) {
      if (timedOut) throw new Error(timeoutMessage, { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
      activeControllers.delete(controller);
    }
  };
}

export function remainingTimeout(deadline, maximumMs) {
  return Math.max(1, Math.min(maximumMs, deadline - Date.now()));
}

export async function settleWithin(task, timeoutMs) {
  if (!task) return true;
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(task).then(() => true, () => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function terminateChild(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit").then(() => true, () => true);
  child.kill();
  const completed = await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
  if (!completed && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }
  child.stdin?.destroy();
  child.stdout?.destroy();
  child.stderr?.destroy();
}

export async function removeDirectoryWithRetry(path, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
