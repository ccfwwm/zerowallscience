// Koffi 3.1.1 offers a copying UTF-16 decoder. Generic decoding of a
// manufactured pointer buffer can request external memory in Electron.
export function adaptDirectoryPicker(source, version) {
  if (version !== '0.2.0-rc.2') throw new Error('Review the directory picker adaptation for this DSH version')
  if (source.includes('ZeroWall UTF16 copy')) return source
  const reader = /function readUtf16\(koffi, address, pointerSize\) \{[\s\S]*?\n\}/u
  if (!reader.test(source) || !source.includes('pointer.writeBigUInt64LE')) throw new Error('Unrecognized Win32 UTF16 decoder')
  let adapted = source.replace(reader, `function readUtf16(koffi, address, pointerSize) {
  // ZeroWall UTF16 copy: no external ArrayBuffer or pointer-buffer decoding.
  if (typeof address !== 'bigint' || address <= 0n) throw new Error('Invalid Win32 folder path pointer');
  return koffi.decode.string16(address);
}`)
  const release = /const path = readUtf16\(koffi, nameOut\[0\], pointerSize\);\s*coTaskMemFree\(nameOut\[0\]\);\s*return \{\s*hr: gotName,\s*path\s*\};/u
  if (!release.test(adapted)) throw new Error('Unrecognized Win32 path allocation lifecycle')
  adapted = adapted.replace(release, `try { return { hr: gotName, path: readUtf16(koffi, nameOut[0], pointerSize) }; }
  finally { coTaskMemFree(nameOut[0]); }`)
  // The showing notice is not a terminal outcome. Keep IPC connected until
  // done/error has flushed so the driver can still cancel the modal dialog.
  if (adapted.includes('send(message, () => {')) {
    adapted = adapted.replace('if (process.connected) process.disconnect();', 'if (message.kind !== "showing" && process.connected) process.disconnect();')
  }
  return adapted
}
