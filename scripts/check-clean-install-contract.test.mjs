import { readFile } from "node:fs/promises";
import test from "node:test";

const hookPath = "apps/desktop/src-tauri/nsis/installer-hooks.nsh";

test("NSIS preinstall hook preserves existing installs and user data during upgrades", async () => {
  const hook = await readFile(hookPath, "utf8");

  assertIncludes(hook, '!insertmacro CheckIfAppIsRunning');
  assertNotIncludes(hook, "ExecWait");
  assertNotIncludes(hook, "RMDir /r");
});

function assertIncludes(content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`Expected NSIS hook to include: ${expected}`);
  }
}

function assertNotIncludes(content, unexpected) {
  if (content.includes(unexpected)) {
    throw new Error(`NSIS hook must not include: ${unexpected}`);
  }
}
