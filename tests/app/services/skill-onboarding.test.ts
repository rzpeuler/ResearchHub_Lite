import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import { SkillOnboardingService, registerOnboardedResearchSkill } from '../../../app/services/skill-onboarding.ts'
import { ResearchSkillRegistry } from '../../../app/services/skill-registry.ts'

function tarFile(name: string, content: string): Buffer {
  const header = Buffer.alloc(512); header.write(name, 0, 100, 'utf8'); header.write('0000644\0', 100, 8, 'ascii'); header.write('0000000\0', 108, 8, 'ascii'); header.write('0000000\0', 116, 8, 'ascii'); header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii'); header.write('00000000000\0', 136, 12, 'ascii'); header.fill(' ', 148, 156); header[156] = 48; header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii'); let checksum = 0; for (const byte of header) checksum += byte; header.write(checksum.toString(8).padStart(6, '0') + '\0', 148, 8, 'ascii'); const data = Buffer.from(content); const padding = Buffer.alloc((512 - (data.length % 512)) % 512); return Buffer.concat([header, data, padding])
}

function githubArchive(): Buffer { return gzipSync(Buffer.concat([tarFile('skill-deadbeef/ SKILL.md'.replace('/ ', '/'), '# Remote Research\n'), tarFile('skill-deadbeef/skill.json'.replace('/ ', '/'), JSON.stringify({ id: 'remote-research', kind: 'research', researchCapability: 'remote', license: 'MIT' })), Buffer.alloc(1024)])) }

test('external Research Skill onboarding pins provenance, classifies, installs, and registers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-skill-source-')); const install = await mkdtemp(join(tmpdir(), 'rhl-skill-install-')); const records = await mkdtemp(join(tmpdir(), 'rhl-skill-records-'))
  try {
    await writeFile(join(root, 'SKILL.md'), '# External Research\n')
    await writeFile(join(root, 'skill.json'), JSON.stringify({ id: 'external-research', kind: 'research', researchCapability: 'external_research', description: 'External evidence method', whenToUse: 'external research', license: 'MIT' }))
    const service = new SkillOnboardingService(install, records); const result = await service.onboardDirectory(root, { source: 'https://github.com/acme/research-skill', pinnedCommit: 'a'.repeat(40) })
    assert.equal(result.kind, 'research'); assert.equal(result.provenance.pinnedCommit, 'a'.repeat(40)); assert.equal(result.installedPath !== undefined, true)
    const registry = new ResearchSkillRegistry(); const definition = registerOnboardedResearchSkill(registry, result); assert.equal(definition?.id, 'external-research'); assert.equal(registry.researchCandidates().some((item) => item.id === 'external-research'), true)
  } finally { await rm(root, { recursive: true, force: true }); await rm(install, { recursive: true, force: true }); await rm(records, { recursive: true, force: true }) }
})

test('unsafe Skill onboarding fails closed without approval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-unsafe-skill-')); const install = await mkdtemp(join(tmpdir(), 'rhl-unsafe-install-')); const records = await mkdtemp(join(tmpdir(), 'rhl-unsafe-records-'))
  try { await writeFile(join(root, 'SKILL.md'), '# Unsafe\n'); await writeFile(join(root, 'package.json'), JSON.stringify({ id: 'unsafe-skill', scripts: { postinstall: 'powershell download' } })); const service = new SkillOnboardingService(install, records); await assert.rejects(() => service.onboardDirectory(root), /requires explicit approval/) } finally { await rm(root, { recursive: true, force: true }); await rm(install, { recursive: true, force: true }); await rm(records, { recursive: true, force: true }) }
})

test('GitHub onboarding requires a pinned commit', () => {
  const service = new SkillOnboardingService('install', 'records'); assert.throws(() => service.inspectGithub({ url: 'https://github.com/acme/skill', commit: 'not-pinned' }), /pinned commit/); assert.equal(service.inspectGithub({ url: 'https://github.com/acme/skill', commit: 'b'.repeat(40) }).provenance.pinnedCommit, 'b'.repeat(40))
})

test('GitHub onboarding inspects a pinned archive, installs safely, and is idempotent', async () => {
  const install = await mkdtemp(join(tmpdir(), 'rhl-remote-install-')); const records = await mkdtemp(join(tmpdir(), 'rhl-remote-records-')); const commit = 'c'.repeat(40); const source = { url: 'https://github.com/acme/remote-skill', commit }; const fetcher = async () => new Response(githubArchive(), { status: 200, headers: { 'content-type': 'application/gzip' } });
  try { const service = new SkillOnboardingService(install, records); const inspection = await service.inspectGithubRemote(source, fetcher); assert.equal(inspection.kind, 'research'); assert.equal(inspection.provenance.pinnedCommit, commit); const first = await service.onboardGithub(source, {}, fetcher); const second = await service.onboardGithub(source, {}, fetcher); assert.equal(first.installedPath, second.installedPath); assert.equal(second.provenance.source, source.url) } finally { await rm(install, { recursive: true, force: true }); await rm(records, { recursive: true, force: true }) }
})
