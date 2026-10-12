import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import sharp from 'sharp'
import { assetsForPage, hash, readManifest, readSpecification, recordVisualAssets, saveJson, workspacePath } from './visual-assets.js'

export interface LayoutFinding { rule: string; page: number; elementIds: string[]; message: string }
export interface PageSnapshot { page: number; id: string; fingerprint: string; data: Record<string, any> }

/** The Office exporter ignores image shape opacity. Bake only the bitmap alpha;
 * never rasterize the page or its editable text. Originals remain untouched. */
export async function prepareSvg(cwd: string, source: string, specPath: string, manifestPath: string, page: number): Promise<string> {
  const path = await workspacePath(cwd, source), raw = await readFile(path, 'utf8')
  if (/<!DOCTYPE|<!ENTITY/iu.test(raw)) throw new Error('SVG entity declarations are not supported.')
  const errors: string[] = []
  const doc = new DOMParser({ onError: (_level, message) => { errors.push(message) } }).parseFromString(raw, 'image/svg+xml')
  if (errors.length || doc.documentElement?.localName !== 'svg') throw new Error('Invalid SVG: repair syntax before retrying.')
  const spec = await readSpecification(cwd, specPath), manifest = await readManifest(cwd, manifestPath)
  const allowed = assetsForPage(spec, manifest, page)
  const outputDirectory = resolve(cwd, '.zerowall', 'presentation-prepared')
  await mkdir(outputDirectory, { recursive: true }); await workspacePath(cwd, resolve(outputDirectory, 'probe'))
  for (const node of Array.from(doc.getElementsByTagName('image'))) {
    const href = node.getAttribute('href') || node.getAttribute('xlink:href')
    if (!href || /^(data:|https?:|file:)/iu.test(href)) throw new Error('SVG images must reference authorized local assets; register them with presentation_record_assets.')
    const imagePath = await workspacePath(cwd, resolve(dirname(path), href))
    // Bundled vector icons remain compiler-native resources, not scientific evidence.
    if (imagePath.toLowerCase().endsWith('.svg')) { node.setAttribute('href', imagePath.replaceAll('\\', '/')); continue }
    const asset = allowed.find(item => resolve(item.path) === imagePath)
    if (!asset) throw new Error(`Page ${page}: image ${href} is not in this page's assetIds.`)
    const bytes = await readFile(imagePath)
    if (hash(bytes) !== asset.sha256) throw new Error(`Asset ${asset.assetId} changed; register and review it again.`)
    const styles = node.getAttribute('style') ?? ''
    const cssOpacity = /(?:^|;)\s*opacity\s*:\s*([^;]+)/iu.exec(styles)?.[1]
    const opacity = Number(cssOpacity ?? (node.getAttribute('opacity') || 1))
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('Image opacity must be between 0 and 1.')
    for (let parent = node.parentNode; parent && parent !== doc; parent = parent.parentNode) {
      if (parent.nodeType !== 1) continue
      const el = parent as typeof node
      if ((el.hasAttribute('opacity') && Number(el.getAttribute('opacity')) !== 1) || /(?:^|;)\s*opacity\s*:/iu.test(el.getAttribute('style') ?? '')) throw new Error('Move images outside translucent groups and set opacity on each image so exported alpha is reliable.')
    }
    let preparedPath = imagePath
    if (opacity < 1) {
      const derivativeId = `alpha-${hash(`${asset.assetId}:${asset.sha256}:${opacity}`).slice(0, 24)}`
      preparedPath = resolve(outputDirectory, derivativeId + '.png')
      const rgba = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      for (let i = 3; i < rgba.data.length; i += 4) rgba.data[i] = Math.round(rgba.data[i]! * opacity)
      const png = await sharp(rgba.data, { raw: { width: rgba.info.width, height: rgba.info.height, channels: 4 } }).png().toBuffer()
      await writeFile(await workspacePath(cwd, preparedPath), png)
      await saveJson(await workspacePath(cwd, preparedPath + '.derivation.json'), { schemaVersion: 1, parentAssetId: asset.assetId, sourcePath: imagePath, sourceSha256: asset.sha256, sha256: hash(png), operation: 'bake-alpha', opacity })
      await recordVisualAssets(cwd, [{ manifest: manifestPath, image: preparedPath, assetId: derivativeId, role: asset.role, sourceKind: 'derived', parentAssetId: asset.assetId }])
    }
    node.removeAttribute('opacity'); node.removeAttribute('xlink:href')
    node.setAttribute('style', styles.replace(/(?:^|;)\s*opacity\s*:[^;]*/giu, ''))
    node.setAttribute('href', preparedPath.replaceAll('\\', '/'))
  }
  const serialized = new XMLSerializer().serializeToString(doc)
  const prepared = await workspacePath(cwd, resolve(outputDirectory, `page-${page}-${hash(serialized).slice(0, 20)}.svg`))
  await writeFile(prepared, serialized)
  return prepared
}

/** Complement glyph lint with image stacking checks over the stored page. */
export function lintImageOcclusion(snapshot: PageSnapshot): LayoutFinding[] {
  const elements = snapshot.data.elements ?? {}, order: string[] = snapshot.data.elementOrder ?? Object.keys(elements), findings: LayoutFinding[] = []
  const image = (element: any) => element?.type === 'image' || !!element?.shapeData?.fill?.fillImageSource
  const meaningful = (element: any) => !!element?.shapeData?.shapeText?.text?.trim() || ['chart', 'table'].includes(element?.type)
  const box = (element: any) => element?.transform
  for (let i = 0; i < order.length; i++) {
    const above = elements[order[i]!], a = box(above)
    if (!image(above) || !a) continue
    for (let j = 0; j < i; j++) {
      const below = elements[order[j]!], b = box(below)
      if (!meaningful(below) || !b) continue
      const overlap = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top))
      if (overlap > 1) findings.push({ rule: 'image-covers-content', page: snapshot.page, elementIds: [order[i]!, order[j]!], message: 'An image above text/chart/table intersects its content bounds. Reposition it or explicitly justify the observed screenshot.' })
    }
  }
  return findings
}
