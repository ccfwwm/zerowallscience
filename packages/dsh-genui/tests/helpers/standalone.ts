/**
 * 将 standalone HTML 解析为 jsdom 文档，供结构化断言使用。
 *
 * @param html - standalone HTML 文本
 * @returns 已解析的 HTML 文档
 */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

/**
 * 将 Base64 文本恢复为 UTF-8 字符串。
 *
 * @param encoded - Base64 编码内容
 * @returns 解码后的 UTF-8 文本
 */
export function decodeBase64Text(encoded: string): string {
  const bytes = Uint8Array.from(
    atob(encoded),
    character => character.charCodeAt(0),
  )

  return new TextDecoder().decode(bytes)
}

/**
 * 读取 HTML 中导出的 GenUI artifact。
 *
 * @param doc - standalone HTML 文档
 * @returns 解析后的 artifact 数据
 */
export function artifactFromDocument(doc: Document): unknown {
  const elements = doc.querySelectorAll('#genui-artifact')

  if (elements.length !== 1) {
    throw new Error(`expected one #genui-artifact, found ${elements.length}`)
  }

  return JSON.parse(
    decodeBase64Text(elements[0].textContent?.trim() ?? ''),
  )
}

/**
 * 按文档顺序返回 HTML 中嵌入的 bundle 名称。
 *
 * @param doc - standalone HTML 文档
 * @returns bundle 名称列表
 */
export function bundleNames(doc: Document): string[] {
  const names = Array.from(
    doc.querySelectorAll<HTMLScriptElement>(
      'script[data-genui-bundle]',
    ),
  ).map(element => element.dataset.genuiBundle ?? '')

  if (new Set(names).size !== names.length) {
    throw new Error('duplicate standalone bundle')
  }

  return names
}

/**
 * 解码指定名称的 bundle 内容。
 *
 * @param doc - standalone HTML 文档
 * @param name - bundle 名称
 * @returns 解码后的 bundle 文本
 */
export function bundleText(doc: Document, name: string): string {
  const elements = Array.from(
    doc.querySelectorAll<HTMLScriptElement>(
      'script[data-genui-bundle]',
    ),
  ).filter(candidate => candidate.dataset.genuiBundle === name)

  if (elements.length !== 1) {
    throw new Error(`expected one standalone bundle ${name}, found ${elements.length}`)
  }

  return decodeBase64Text(elements[0].textContent?.trim() ?? '')
}

/**
 * 将 CSP meta 内容解析为 directive 到值列表的映射。
 *
 * @param doc - standalone HTML 文档
 * @returns CSP directive 映射
 */
export function cspFromDocument(
  doc: Document,
): Record<string, string[]> {
  const content = doc
    .querySelector('meta[http-equiv="Content-Security-Policy"]')
    ?.getAttribute('content')

  if (content === null || content === undefined) {
    throw new Error('missing CSP')
  }

  return Object.fromEntries(
    content
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const [directive, ...values] = part.split(/\s+/)
        return [directive!, values]
      }),
  )
}

/**
 * 从 standalone theme 文本读取指定 selector 的 token 声明，保留最后一次声明的值。
 *
 * @param css - 待检查的 CSS 文本
 * @param selector - 目标 selector
 * @returns token 名称到值的映射
 */
export function parseCssVariables(
  css: string,
  selector: string,
): Record<string, string> {
  const rules = Array.from(
    css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ).filter(([, ruleSelector]) => ruleSelector.trim() === selector)

  if (rules.length === 0) {
    throw new Error(`missing CSS rule: ${selector}`)
  }

  const declarations: Record<string, string> = {}

  for (const [, , body] of rules) {
    for (const [, name, value] of body.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)) {
      declarations[name] = value.trim()
    }
  }

  return declarations
}

/**
 * 选择需要检查的 theme token，并在缺少 token 时立即报告。
 *
 * @param declarations - selector 中的 token 声明
 * @param keys - 需要检查的 token 名称
 * @returns 指定 token 的值
 */
export function pickTokens(declarations: Record<string, string>, keys: string[]): Record<string, string> {
  for (const key of keys) {
    if (!(key in declarations)) {
      throw new Error(`missing CSS token: ${key}`)
    }
  }

  return Object.fromEntries(keys.map(key => [key, declarations[key]]))
}
