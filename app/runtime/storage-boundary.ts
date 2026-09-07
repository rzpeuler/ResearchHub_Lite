import { realpath } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { ApplicationServiceError } from '../services/contracts.ts'

function isInside(root: string, candidate: string): boolean {
  const child = relative(resolve(root), resolve(candidate))
  return child === '' || (child !== '..' && !child.startsWith(`..${'\\'}`) && !child.startsWith(`..${'/'}`) && !/^[A-Za-z]:[\\/]/.test(child) && !child.startsWith('/'))
}

function invalid(message: string, cause?: unknown): ApplicationServiceError {
  return new ApplicationServiceError('invalid_input', message, cause === undefined ? undefined : { cause })
}

export function assertLexicallyDisjointStorageRoots(workspaceRoot: string, mountedKnowledgeBaseRoot: string): void {
  const workspace = resolve(workspaceRoot)
  const knowledgeBase = resolve(mountedKnowledgeBaseRoot)
  if (isInside(workspace, knowledgeBase) || isInside(knowledgeBase, workspace)) throw invalid('workspaceRoot and mountedKnowledgeBaseRoot must be disjoint')
}

async function canonicalizeWithMissingTail(path: string): Promise<string | undefined> {
  let current = resolve(path)
  const missing: string[] = []
  while (true) {
    try {
      let canonical = await realpath(current)
      for (const segment of missing.reverse()) canonical = resolve(canonical, segment)
      return canonical
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw invalid('Runtime storage boundary cannot be resolved', error)
      const parent = dirname(current)
      if (parent === current) return undefined
      missing.push(current.slice(parent.length).replace(/^[\\/]+/, ''))
      current = parent
    }
  }
}

/**
 * Validates the Runtime workspace against the mounted canonical Knowledge Base.
 * Lexical checks run before any directory creation; canonical checks also cover
 * existing symlinks and missing workspace tails below symlinked ancestors.
 */
export async function validateStorageRoots(workspaceRoot: string, mountedKnowledgeBaseRoot: string): Promise<void> {
  assertLexicallyDisjointStorageRoots(workspaceRoot, mountedKnowledgeBaseRoot)
  const [workspaceCanonical, knowledgeBaseCanonical] = await Promise.all([
    canonicalizeWithMissingTail(workspaceRoot),
    canonicalizeWithMissingTail(mountedKnowledgeBaseRoot),
  ])
  if (workspaceCanonical !== undefined && knowledgeBaseCanonical !== undefined) {
    if (isInside(workspaceCanonical, knowledgeBaseCanonical) || isInside(knowledgeBaseCanonical, workspaceCanonical)) throw invalid('workspaceRoot and mountedKnowledgeBaseRoot overlap through filesystem resolution')
  }
}
