import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export async function createFreshKnowledgeBaseV04(rootRef: string, options: { readonly knowledgeBaseId?: string; readonly name?: string; readonly now?: string } = {}): Promise<string> {
  const root = resolve(rootRef); const now = options.now ?? new Date().toISOString();
  for (const directory of ['registry', 'raw', 'theme-groups', 'entities', 'relations', 'claims', 'sources', 'modules', 'logs/research']) await mkdir(join(root, directory), { recursive: true })
  await writeFile(join(root, 'manifest.yaml'), `${JSON.stringify({ knowledgeBaseId: options.knowledgeBaseId ?? 'kb-personal-research', name: options.name ?? 'Personal Research Knowledge Base', schemaVersion: '0.4', storageFormatVersion: '1', revision: 0, status: 'active', createdAt: now, updatedAt: now })}\n`)
  await writeFile(join(root, 'registry', 'assets.yaml'), '{}\n'); await writeFile(join(root, 'registry', 'raw.yaml'), '{}\n'); return root
}
