import { strict as assert } from 'node:assert'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import test from 'node:test'
import { discoverTests } from '../run-node-tests.mjs'

test('node test discovery excludes the validation evidence boundary', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'researchhub-test-discovery-'))
  const validationRoot = join(fixtureRoot, 'tests', 'validation')
  const evidenceRoot = join(validationRoot, 'evidence')

  try {
    await mkdir(evidenceRoot, { recursive: true })
    await writeFile(join(validationRoot, 'ordinary.test.ts'), '')
    await writeFile(join(evidenceRoot, 'example.test.ts'), '')

    const discovered = await discoverTests(validationRoot, [evidenceRoot])
    assert.deepEqual(discovered.map((file) => relative(validationRoot, file)), ['ordinary.test.ts'])
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})
