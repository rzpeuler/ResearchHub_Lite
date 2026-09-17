import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SkillOnboardingService, registerOnboardedResearchSkill } from '../../../app/services/skill-onboarding.ts'
import { ResearchSkillRegistry } from '../../../app/services/skill-registry.ts'

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
