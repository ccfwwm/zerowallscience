import science from '@zerowall/dsh-bundle-science/package.json' with { type: 'json' }

/** Bundles selected for a new ZeroWall Desktop profile; existing selections remain user-owned. */
export const ZEROWALL_DEFAULT_BUNDLES = [...science.zerowall.defaultBundles, science.name] as const

/** Science-owned packages that may receive profile generations independently of the application. */
export const ZEROWALL_PROFILE_OVERRIDES = ZEROWALL_DEFAULT_BUNDLES.filter(name => name.startsWith('@zerowall/'))

/** Published and legacy ZeroWall package identities accepted during profile migration. */
export const ZEROWALL_PACKAGE_RENAMES: Readonly<Record<string, string>> = {
  '@ccfwwm/dsh-plugin-ai-cloud': '@zerowall/dsh-plugin-ai-cloud',
  '@ccfwwm/dsh-plugin-brand-ui': '@zerowall/dsh-plugin-brand-ui',
  '@ccfwwm/dsh-bundle-science': '@zerowall/dsh-bundle-science',
  '@zerowallscience/dsh-bundle-science': '@zerowall/dsh-bundle-science',
  '@zerowallscience/plugin-images': '@zerowall/dsh-imagecreate',
  '@zerowallscience/plugin-videos': '@zerowall/dsh-videocreate',
  '@zerowallscience/plugin-claude-code': '@zerowall/dsh-claude-coderun',
  'dsh-ppt-maker': '@zerowall/dsh-pptcreate',
  'dsh-zotero': '@zerowall/dsh-zotero',
  '@oh-story/dsh': '@zerowall/dsh-videocreate',
}
