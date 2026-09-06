import { dirname, relative, resolve, join } from 'node:path'
import { realpath } from 'node:fs/promises'
import { createLocalBashOperations, type BashOperations } from '@earendil-works/pi-coding-agent'
import type { EditOperations } from '@earendil-works/pi-coding-agent'
import type { WriteOperations } from '@earendil-works/pi-coding-agent'

export const BASH_ISOLATION_GAP = 'BASH_ISOLATION_GAP'

export function isCanonicalKnowledgeBasePath(candidate: string, knowledgeBaseRoot: string, baseDirectory = process.cwd()): boolean {
  const root = resolve(knowledgeBaseRoot)
  const path = resolve(baseDirectory, candidate)
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${'\\'}`) && !rel.startsWith(`..${'/'}`))
}

export function protectedPathError(path: string): Error {
  return new Error(`Canonical Knowledge Base is protected; use a ResearchHub application tool or Writer: ${path}`)
}

export async function isCanonicalKnowledgeBasePathSecure(candidate: string, knowledgeBaseRoot: string, baseDirectory = process.cwd()): Promise<boolean> {
  if (isCanonicalKnowledgeBasePath(candidate, knowledgeBaseRoot, baseDirectory)) return true
  const absoluteCandidate = resolve(baseDirectory, candidate)
  const canonicalRoot = await realpath(resolve(knowledgeBaseRoot))
  let canonicalTarget: string
  try {
    canonicalTarget = await realpath(absoluteCandidate)
  } catch {
    canonicalTarget = join(await realpath(dirname(absoluteCandidate)), absoluteCandidate.slice(dirname(absoluteCandidate).length + 1))
  }
  const rel = relative(canonicalRoot, canonicalTarget)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${'\\'}`) && !rel.startsWith(`..${'/'}`))
}

export function createProtectedWriteOperations(root: string, base: WriteOperations = {
  writeFile: async (path, content) => { const { writeFile } = await import('node:fs/promises'); await writeFile(path, content) },
  mkdir: async (path) => { const { mkdir } = await import('node:fs/promises'); await mkdir(path, { recursive: true }) },
}): WriteOperations {
  return {
    writeFile: async (path, content) => { if (await isCanonicalKnowledgeBasePathSecure(path, root)) throw protectedPathError(path); await base.writeFile(path, content) },
    mkdir: async (path) => { if (await isCanonicalKnowledgeBasePathSecure(path, root)) throw protectedPathError(path); await base.mkdir(path) },
  }
}

export function createProtectedEditOperations(root: string, base: EditOperations): EditOperations {
  return {
    readFile: base.readFile,
    access: async (path) => { if (await isCanonicalKnowledgeBasePathSecure(path, root)) throw protectedPathError(path); await base.access(path) },
    writeFile: async (path, content) => { if (await isCanonicalKnowledgeBasePathSecure(path, root)) throw protectedPathError(path); await base.writeFile(path, content) },
  }
}

export function createProtectedBashOperations(root: string, base: BashOperations = createLocalBashOperations()): BashOperations {
  return {
    exec: async (command, cwd, options) => {
      // This is a transparent interception for commands that explicitly name the
      // mounted KB. Arbitrary shell programs can still construct the path, so
      // callers must treat the remaining shell surface as an isolation gap.
      const normalizedCommand = command.replaceAll('\\', '/').toLowerCase()
      const normalizedRoot = resolve(root).replaceAll('\\', '/').toLowerCase()
      if (isCanonicalKnowledgeBasePath(cwd, root, cwd) || normalizedCommand.includes(normalizedRoot)) throw protectedPathError(command)
      return base.exec(command, cwd, options)
    },
  }
}
