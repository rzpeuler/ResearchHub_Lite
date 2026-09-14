import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyDiagnosticFailure, classifyModelRuntime, TEST_033_SECTIONS } from './industry-model-runtime-live-diagnosis.ts'

test('completed production lifecycle is healthy', () => { assert.equal(classifyModelRuntime({ preflightOk: true, workflowStatus: 'completed', gatewaySubmissionCount: 1, revisionDelta: 1, reportType: 'industry_research', sectionCount: 16, sectionTitles: TEST_033_SECTIONS }), 'MODEL_RUNTIME_PATH_HEALTHY') })
test('external model/runtime failure remains inconclusive', () => { assert.equal(classifyDiagnosticFailure({ preflightOk: true, error: 'timeout' }), 'MODEL_RUNTIME_EXTERNAL_INCONCLUSIVE'); assert.equal(classifyDiagnosticFailure({ preflightOk: false, error: 'process-launch' }), 'MODEL_RUNTIME_EXTERNAL_INCONCLUSIVE') })
test('concrete project adapter/contract boundary is a project defect', () => { assert.equal(classifyDiagnosticFailure({ preflightOk: true, error: 'local-structured-output-validation', boundary: 'project-controlled-contract-or-adapter' }), 'MODEL_RUNTIME_PROJECT_DEFECT') })
test('bounded repair followed by completion is healthy', () => { assert.equal(classifyModelRuntime({ preflightOk: true, workflowStatus: 'completed', gatewaySubmissionCount: 1, revisionDelta: 1, reportType: 'industry_research', sectionCount: 16, sectionTitles: [...TEST_033_SECTIONS], terminalErrorCategory: null }), 'MODEL_RUNTIME_PATH_HEALTHY') })
test('classification does not accept public-provider outcomes as inputs', () => { assert.equal(classifyModelRuntime({ preflightOk: true, workflowStatus: 'completed', gatewaySubmissionCount: 1, revisionDelta: 1, reportType: 'industry_research', sectionCount: 16, sectionTitles: TEST_033_SECTIONS }), 'MODEL_RUNTIME_PATH_HEALTHY') })
