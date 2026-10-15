#!/usr/bin/env -S npx tsx
/**
 * C2（选集美学纲领）：从 gallerySpec 生成 GitHub Pages 选集页。
 *
 * 链路：gallerySpec → createGenuiArtifact → createStandaloneHtmlDocument
 * （bundles 由本脚本从 lib/assets/ 读文件注入——浏览器导出走 fetch，node 里
 * 直接读盘，同一纯函数两个来源）→ site/anthology.html。
 * site/** 由 deploy-product-site.yml 自动部署到 GitHub Pages，零新增基建。
 *
 * 前置：先 `pnpm build`——standalone-runtime.js 内嵌渲染器，旧产物不含新字段。
 * 用法：npx tsx scripts/build-anthology-page.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { gallerySpec } from '../src/client/gallery.ts'
import { createGenuiArtifact } from '../src/client/artifact/create.ts'
import { createStandaloneHtmlDocument } from '../src/client/artifact/html.ts'
import { analyzeGenuiPortability } from '../src/client/artifact/portability.ts'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PAGES_BASE = 'https://omdsh-dev.github.io/dsh-genui/'

const artifact = createGenuiArtifact(gallerySpec, undefined, { locale: 'zh', theme: 'light' })
const names = [...analyzeGenuiPortability(gallerySpec).requiredAssets.map(name => `${name}.js`), 'standalone-runtime.js']
const bundles = new Map(names.map(name => [name, new Uint8Array(readFileSync(join(REPO, 'lib/assets', name)))]))
const html = createStandaloneHtmlDocument(artifact, bundles, PAGES_BASE)

mkdirSync(join(REPO, 'site'), { recursive: true })
writeFileSync(join(REPO, 'site/anthology.html'), html)
console.log(`✓ site/anthology.html written (${(html.length / 1024 / 1024).toFixed(2)} MB, engines: ${names.join(', ')})`)
