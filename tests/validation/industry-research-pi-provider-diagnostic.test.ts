import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyDiagnostic, type Observation } from './industry-research-pi-provider-diagnostic.ts'
const o = (outcome: Observation['outcome']): Observation => ({ attempted: true, outcome })
test('diagnostic classifier covers general primary failure', () => assert.equal(classifyDiagnostic({ primaryControl: o('provider_error'), primaryExact: { attempted: false, outcome: 'unavailable' }, alternativeModelAvailable: false }), 'PRIMARY_PROVIDER_GENERAL_FAILURE'))
test('diagnostic classifier covers exact primary success', () => assert.equal(classifyDiagnostic({ primaryControl: o('success'), primaryExact: o('success'), alternativeModelAvailable: false }), 'PRIMARY_EXACT_REQUEST_NOW_EXECUTES'))
test('diagnostic classifier distinguishes target-sensitive primary block', () => assert.equal(classifyDiagnostic({ primaryControl: o('success'), primaryExact: o('sensitive'), primaryAlternate: o('success'), alternativeModelAvailable: false }), 'PRIMARY_TARGET_SENSITIVE_BLOCK'))
test('diagnostic classifier records no-alternative inconclusive result', () => assert.equal(classifyDiagnostic({ primaryControl: o('success'), primaryExact: o('sensitive'), primaryAlternate: o('sensitive'), alternativeModelAvailable: false }), 'INCONCLUSIVE_NO_ALTERNATIVE'))
test('diagnostic classifier identifies primary model compatibility gap', () => assert.equal(classifyDiagnostic({ primaryControl: o('success'), primaryExact: o('sensitive'), alternativeModelAvailable: true, alternativeControl: o('success'), alternativeExact: o('success') }), 'PRIMARY_MODEL_COMPATIBILITY_GAP'))
test('diagnostic classifier identifies cross-model design block', () => assert.equal(classifyDiagnostic({ primaryControl: o('success'), primaryExact: o('sensitive'), alternativeModelAvailable: true, alternativeControl: o('success'), alternativeExact: o('sensitive') }), 'CROSS_MODEL_DESIGN_REQUEST_BLOCK'))
test('diagnostic classifier separates non-safety output failures', () => assert.equal(classifyDiagnostic({ primaryControl: o('success'), primaryExact: o('invalid_output'), alternativeModelAvailable: true }), 'PRIMARY_REQUEST_NONSAFETY_FAILURE'))
