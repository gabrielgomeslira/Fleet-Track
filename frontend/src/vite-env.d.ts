/// <reference types="vite/client" />

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string
}
declare module 'node:path' {
  export function resolve(...paths: string[]): string
}
declare module 'node:process' {
  interface Process {
    cwd(): string
  }
  const process: Process
  export default process
}
