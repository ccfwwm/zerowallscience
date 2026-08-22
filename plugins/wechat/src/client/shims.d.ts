/** client 构建用 esbuild text-loader 内联 CSS 文本。 */
declare module '*.css?inline' {
  const text: string
  export default text
}
