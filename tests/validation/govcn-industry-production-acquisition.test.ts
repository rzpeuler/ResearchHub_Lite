import assert from 'node:assert/strict'
import test from 'node:test'
import { contextCategories, substantive, TARGET } from './govcn-industry-production-acquisition.ts'

test('focused validation target and bounded context classification are deterministic', () => { assert.equal(TARGET.searchTerms.length, 8); const categories = contextCategories('印制电路板技术标准与产能生产政策'); assert.equal(categories.policyOrStandardContext, true); assert.equal(categories.technologyOrProductContext, true); assert.equal(categories.capacityOrProductionContext, true); assert.equal(substantive(categories), true); assert.equal(substantive(contextCategories('企业名单与行业公司')), false) })
test('privacy-safe evidence projection does not retain document prose', () => { const categories = contextCategories('hidden prose'); assert.deepEqual(Object.keys(categories).sort(), ['capacityOrProductionContext', 'companyQualificationContext', 'industryDefinitionContext', 'policyOrStandardContext', 'technologyOrProductContext'].sort()) })
