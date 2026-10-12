import { AiCloudClient } from '../../plugins/account/src/host/index.ts'
import { AiCloudImageGenerator } from '../../plugins/images/src/host/generator.ts'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// Credentials arrive on stdin, live only in this process, and are never logged.
const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
const login = JSON.parse(Buffer.concat(chunks).toString('utf8'))
chunks.length = 0
const values = new Map<string, string>()
const secrets = { get: async (key: string) => values.get(key), set: async (key: string, value: string) => { values.set(key, value) }, delete: async (key: string) => { values.delete(key) } }
const account = new AiCloudClient({ secrets, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60000) }) })
const root = resolve('artifacts/verification/8.1.2/presentation-regression')
await mkdir(resolve(root, 'assets'), { recursive: true })
try {
  const started = performance.now()
  const snapshot = await account.login({ ...login, rememberPassword: false })
  delete login.password; delete login.email
  const imageModel = snapshot.models.find(model => model.capability === 'image-generation' && model.modelId === 'gpt-image-2')
  if (!imageModel) throw new Error('Authorized account did not expose gpt-image-2. Keep selected model; refresh the catalog.')
  const service = new AiCloudImageGenerator({ secrets, account, imageModel: async () => imageModel, imageQuality: async () => 'medium' })
  service.update(snapshot)
  const labelled = process.argv.includes('--labelled')
  const input = labelled ? { prompt: 'Create a beautiful publication-quality explanatory scientific graphic to be placed as an independent image in a Chinese academic PowerPoint report. Wide clear modular composition on PURE WHITE background. Left: a realistic but clean healthy-food cluster with vegetables, beans, whole grains and fish; label exactly "饮食质量". Center upper: elegant immune-cell illustration; label exactly "炎症负荷" and a small label "SII". Center lower: elegant lipoprotein-particle illustration; label exactly "血脂状态" and a small label "AIP". Right: restrained teal human silhouette with cellular illustration; label exactly "生理稳态". Use crisp readable Chinese sans-serif labels, large dark teal text, perfect spelling, generous space around labels, no overlap between words and subjects. Four distinct readable regions, upper/lower center entities are independent, DO NOT connect SII to AIP. Use subtle pale teal and warm gold dividers, refined light scientific illustration, strong visual hierarchy, high clarity even displayed at 600px wide. There is no slide title, no footer, no source text, no watermark, no fake numbers, no experimental results, no charts, no random additional words. This explains concepts only; causal connections are not established. A harmonious professional graphic, not a full slide.', outputPath: 'assets/diet-explanation-labelled.png' } : { prompt: 'Scientific conceptual illustration for an academic NHANES dietary quality presentation. A healthy meal of vegetables, whole grains, beans and fish, adjacent to two visually separate conceptual motifs: immune cells/inflammation and lipoprotein particles/lipid metabolism, then a calm abstract human biological-aging motif. Crisp sophisticated flat editorial illustration, warm white background, restrained deep teal and burnt orange palette, clear three-region composition, useful wide inset illustration, generous margins, no words, no letters, no numbers, no chart, no graph, no measured data, no arrows implying a verified serial causal pathway, no watermark. Visual expression only; does not represent real measurements.', outputPath: 'assets/diet-mechanism.png' }
  const generationStarted = performance.now()
  const generated = await service.generate(input, root, AbortSignal.timeout(240000))
  const generationMs = performance.now() - generationStarted
  const cacheStarted = performance.now(), resumed = await service.generate(input, root)
  if (!resumed.cached || resumed.sha256 !== generated.sha256) throw new Error('Successful image was not reused by the real request cache.')
  const report = { signedIn: snapshot.status === 'signedIn', model: generated.model, requestedQuality: generated.requestedQuality, actualQuality: generated.actualQuality, providerId: generated.providerId, groupId: generated.groupId, path: generated.path, sha256: generated.sha256, bytes: generated.bytes, width: generated.actualWidth, height: generated.actualHeight, generationMs, cacheMs: performance.now() - cacheStarted, totalMs: performance.now() - started, cached: resumed.cached }
  await writeFile(resolve(root, labelled ? 'image-labelled-smoke.json' : 'image-smoke.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally { values.clear(); delete login.password }
