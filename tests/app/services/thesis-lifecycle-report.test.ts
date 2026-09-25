import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { renderResearchReport, validateResearchReport, writeResearchReport, type ResearchReport } from '../../../app/services/research-report.ts'

const report: ResearchReport = { reportId: 'thesis-lifecycle-report', reportType: 'thesis_lifecycle', subjectRefs: ['thesis:acme-demand'], generatedAt: '2026-09-24T12:00:00.000Z', asOf: '2026-09-24T12:00:00.000Z', workflowRunId: 'thesis-run', knowledgeBaseRevision: 4, sourceRefs: ['source:filing'], claimRefs: ['claim:demand'], methodology: 'Thesis Lifecycle fixture', sections: [{ id: 'summary', title: 'Lifecycle Summary', markdown: 'Bounded thesis update.' }], outputPath: 'thesis-lifecycle-report.md' }

test('thesis_lifecycle reports accept thesis refs, render their title, and persist validated metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-report-'))
  try {
    assert.equal(validateResearchReport(report), report)
    assert.match(renderResearchReport(report), /^# Thesis Lifecycle/m)
    const output = await writeResearchReport(report, root)
    assert.match(await readFile(output, 'utf8'), /^# Thesis Lifecycle/m)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('thesis refs are rejected for other report types and other checks remain active', () => {
  assert.throws(() => validateResearchReport({ ...report, reportType: 'thesis_red_team' }), /canonical references valid for the report type/)
  assert.throws(() => validateResearchReport({ ...report, subjectRefs: ['entity:acme'], sections: [] }), /sections must contain/)
})
