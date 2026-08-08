import { readFile } from "node:fs/promises";
import test from "node:test";

const hookPath = "apps/desktop/src-tauri/nsis/installer-hooks.nsh";

test("NSIS preinstall hook removes legacy installs and app data for clean 1.0 installs", async () => {
  const hook = await readFile(hookPath, "utf8");

  const requiredSnippets = [
    'ExecWait \'"$LOCALAPPDATA\\ZeroWall Science\\uninstall.exe" /S\'',
    'RMDir /r "$LOCALAPPDATA\\ZeroWall Science"',
    'RMDir /r "$LOCALAPPDATA\\com.zerowall.science"',
    'RMDir /r "$APPDATA\\com.zerowall.science"',
    'RMDir /r "$DOCUMENTS\\ZeroWallScience"',
  ];

  for (const snippet of requiredSnippets) {
    assertIncludes(hook, snippet);
  }
});

function assertIncludes(content, expected) {
  if (!content.includes(expected)) {
    throw new Error(`Expected NSIS hook to include: ${expected}`);
  }
}
