import assert from 'node:assert/strict'

/** Read Windows RT_MANIFEST, including nested language resource entries. */
export function executionLevel(buffer) {
  const pe = buffer.readUInt32LE(0x3c)
  assert.equal(buffer.readUInt32LE(pe), 0x00004550)
  const sections = buffer.readUInt16LE(pe + 6), optional = pe + 24
  const optionalSize = buffer.readUInt16LE(pe + 20)
  const resources = optional + (buffer.readUInt16LE(optional) === 0x20b ? 112 : 96) + 16
  function physical(rva) {
    for (let i = 0; i < sections; i++) {
      const section = optional + optionalSize + i * 40
      const virtualSize = buffer.readUInt32LE(section + 8), virtualAddress = buffer.readUInt32LE(section + 12)
      const rawSize = buffer.readUInt32LE(section + 16), rawOffset = buffer.readUInt32LE(section + 20)
      if (rva >= virtualAddress && rva < virtualAddress + Math.max(virtualSize, rawSize)) return rawOffset + rva - virtualAddress
    }
    throw Error('PE resource RVA outside sections')
  }
  const base = physical(buffer.readUInt32LE(resources))
  function entries(offset) {
    const position = base + offset, count = buffer.readUInt16LE(position + 12) + buffer.readUInt16LE(position + 14)
    return Array.from({ length: count }, (_, i) => ({ name: buffer.readUInt32LE(position + 16 + 8 * i), target: buffer.readUInt32LE(position + 20 + 8 * i) }))
  }
  let entry = entries(0).find(entry => entry.name === 24)
  assert(entry, 'Executable lacks RT_MANIFEST')
  while (entry.target & 0x80000000) entry = entries(entry.target & 0x7fffffff)[0]
  const data = base + entry.target
  const start = physical(buffer.readUInt32LE(data)), size = buffer.readUInt32LE(data + 4)
  const xml = buffer.subarray(start, start + size).toString('utf8')
  const level = /requestedExecutionLevel[^>]+level\s*=\s*["']([^"']+)/u.exec(xml)?.[1]
  assert(level, 'Executable manifest lacks execution level')
  return level
}
