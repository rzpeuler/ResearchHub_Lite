import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { workflowReplayEvidence } from '../../scripts/acceptance-expectation-source-001c-replay.ts'

function result(status: string, workflowRunId: string) {
  void workflowRunId
  return { status, semanticValue: { workflowRunId: 'excluded-from-semantic-value', status: 'completed', sections: [] } }
}

test('001C-FIX-001 blocked primary keeps Workflow replay unexercised and hashes null', () => {
  assert.deepEqual(workflowReplayEvidence(), {
    available: false,
    reason: 'FULL_WORKFLOW_NOT_COMPLETED',
    replayAHash: null,
    replayBHash: null,
    equal: null,
  })
})

test('001C-FIX-001 completed primary with two completed replays records equal semantic hashes', () => {
  const evidence = workflowReplayEvidence(result('completed', 'replay-a'), result('completed', 'replay-b'))
  assert.equal(evidence.available, true)
  assert.match(evidence.replayAHash ?? '', /^[a-f0-9]{64}$/)
  assert.equal(evidence.replayAHash, evidence.replayBHash)
  assert.equal(evidence.equal, true)
})

test('001C-FIX-001 partial replay never exposes a one-sided Workflow hash', () => {
  const evidence = workflowReplayEvidence(result('blocked', 'replay-a'), result('completed', 'replay-b'))
  assert.equal(evidence.available, false)
  assert.equal(evidence.replayAHash, null)
  assert.equal(evidence.replayBHash, null)
  assert.equal(evidence.equal, null)
})

test('001C-FIX-001 committed blocked evidence keeps bundle determinism independent from Workflow replay', async () => {
  const evidence = JSON.parse(await readFile('docs/project-state/evidence/2026-09-20-expectation-source-001c-real.json', 'utf8')) as {
    readonly bundleDeterminism: { readonly equal: boolean }
    readonly workflowReplay: { readonly available: boolean; readonly replayAHash: string | null; readonly replayBHash: string | null; readonly equal: boolean | null }
    readonly targets: readonly { readonly symbol: string; readonly reports: number; readonly estimates: number; readonly expectationProjectionDiagnostics?: readonly string[] }[]
  }
  assert.equal(evidence.bundleDeterminism.equal, true)
  assert.equal(evidence.workflowReplay.available, false)
  assert.equal(evidence.workflowReplay.replayAHash, null)
  assert.equal(evidence.workflowReplay.replayBHash, null)
  assert.equal(evidence.workflowReplay.equal, null)
  const secondary = evidence.targets.find((target) => target.symbol === '300750')
  assert.ok(secondary && secondary.reports > 0)
  assert.equal(secondary?.estimates === 0, secondary?.expectationProjectionDiagnostics?.some((item) => item.includes('eastmoney_target_fiscal_year_eps_unavailable')))
})
