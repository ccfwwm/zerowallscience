export const legacyMediaId = '@oh-story/dsh'
export const mediaId = '@zerowallscience/plugin-videos'

// Older signed adaptations predate renamedTo. Installed file/link specs are
// normal for these releases; identify their product contract as well as semver.
export function managedLegacyMedia(installed, spec) {
  if (installed) return installed.zerowall?.renamedTo === mediaId
    || installed.name === legacyMediaId && /^0\.1\.\d+-zws\.\d+$/u.test(installed.version ?? '')
      && installed.zerowall?.capabilities?.includes('media.create')
      && installed.zerowall?.requiredServices?.includes('zerowallMedia')
  return Boolean(spec && /^[~^]?0\.1\.\d+-zws\.\d+$/u.test(spec))
}
