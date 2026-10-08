/** CSS Modules class-map declaration (tsdown compiles .module.css at build). */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

/** Side-effect stylesheet imported by the client shell. */
declare module '*.css' {}
