/** Desktop-specific selection of workspace and runtime-only dependency patches. */

/** A patch shared with the workspace, excluded from runtime installation, or supplied only to Desktop. */
export type DesktopRuntimePatch =
  | { scope: 'shared'; reason: string }
  | { scope: 'workspace-only'; reason: string }
  | { scope: 'packaged'; reason: string }
  | { scope: 'runtime-only'; path: string; reason: string }

/** Every workspace patch requires an explicit Desktop decision; runtime-only entries may add or replace a patch. */
export const DESKTOP_RUNTIME_PATCHES: Readonly<Record<string, DesktopRuntimePatch>> = {
  'dsh-better-sidebar@0.32.1': { scope: 'shared', reason: 'File rows use shared reference dragging, and file routes use the admitted Host peer.' },
  'dsh-computer-use-win@0.6.3': { scope: 'shared', reason: 'Use the verified alpha MCP client and pass a physical script path to the Windows subprocess.' },
  '@huanlin/dsh-plugin-better-locale@0.4.3': { scope: 'packaged', reason: 'The patched language pack ships in the verified local package set, including profile updates.' },
  '@botiverse/oar@0.67.0': { scope: 'workspace-only', reason: 'Patched OAR adapters are embedded in the provider bundle.' },
  '@earendil-works/pi-ai@1.5.2': { scope: 'shared', reason: 'Runtime providers retain Gemini tool-call signatures.' },
  '@electron/osx-sign@1.3.3': { scope: 'workspace-only', reason: 'Signing executes on the build host.' },
  '@fortune-sheet/core@1.0.4': { scope: 'workspace-only', reason: 'Patched spreadsheet code is embedded in the client bundle.' },
  '@fortune-sheet/react@1.0.4': { scope: 'workspace-only', reason: 'Patched spreadsheet code is embedded in the client bundle.' },
  '@yao-pkg/pkg@6.21.0': { scope: 'workspace-only', reason: 'The executable packer executes on the build host.' },
  'app-builder-lib@26.17.0': { scope: 'workspace-only', reason: 'DMG format validation executes on the build host.' },
  'exceljs@4.4.0': { scope: 'workspace-only', reason: 'The patched parser is embedded in the client bundle and worker.' },
  'lexical@0.49.0': { scope: 'workspace-only', reason: 'The patched editor is embedded in the client bundle.' },
  'mdast-util-gfm-autolink-literal@2.0.1': { scope: 'workspace-only', reason: 'The patched Markdown parser is embedded in the client bundle.' },
  'micromark-extension-gfm-autolink-literal@2.1.0': { scope: 'workspace-only', reason: 'The patched Markdown parser is embedded in the client bundle.' },
  'node-pty@1.2.0-beta.15': { scope: 'shared', reason: 'Runtime terminals need helper resolution and Windows worker cleanup.' },
}

/** Reviewed Desktop dependency constraints, independent of patch selection. */
export const DESKTOP_RUNTIME_DEPENDENCY_OVERRIDES: Readonly<Record<string, string>> = {
  // Keep one qualified SDK release across Host and dynamically installed providers.
  '@earendil-works/pi-ai': '1.5.2',
}
