// Vite and Vitest load a migration's SQL as text with `?raw`; this tells tsc the shape.
declare module '*.sql?raw' {
  const text: string
  export default text
}
