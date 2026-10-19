import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { adaptDirectoryPicker } from './adapt-directory-picker.mjs'
import { pinnedDsh } from './adapt-reviewed-dsh.mjs'

test('pinned picker uses the copying UTF16 decoder and retains IPC until terminal outcome', async () => {
  for (const path of ['lib/worker.cjs', 'lib/types/win32-dialog-bindings.js']) {
    const source = await readFile(new URL('../../deepseek-harness/packages/host/directory-picker-native/' + path, import.meta.url), 'utf8')
    const adapted = adaptDirectoryPicker(source, pinnedDsh.version)
    const reader = adapted.match(/function readUtf16\(koffi, address, pointerSize\) \{[\s\S]*?\n\}/u)[0]
    const read = vm.runInNewContext(`(${reader})`)
    assert.equal(read({ decode: { string16: pointer => { assert.equal(pointer, 42n); return 'C:\\科研 空格'; } } }, 42n, 8), 'C:\\科研 空格')
    assert.throws(() => read({}, 0n, 8), /Invalid Win32/)
    assert.match(adapted, /finally \{ coTaskMemFree/)
    if (path.endsWith('worker.cjs')) assert.match(adapted, /message.kind !== "showing"/)
    assert.equal(adaptDirectoryPicker(adapted, pinnedDsh.version), adapted)
  }
  assert.throws(() => adaptDirectoryPicker('', '0.2.1'), /Review/)
  assert.throws(() => adaptDirectoryPicker('unknown', pinnedDsh.version), /Unrecognized/)
})
