import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateCompanyIndustryExposureBridge } from '../../workflows/company-deep-research/industry-exposure-bridge.ts'

const refs = (name: string): readonly string[] => [`source:${name}`]
const item = (company: string, delta: number) => ({ id: `${company}-volume`, driver: { id: 'industry-volume', name: 'Industry shipment volume', delta, unit: 'percent', period: '2026-H1', sourceRefs: refs('industry-volume') }, exposure: { type: 'revenue' as const, description: `${company} shipment revenue exposure`, value: company === 'A' ? 100 : 25, unit: 'CNYm', sourceRefs: refs(`${company}-exposure`) }, sensitivity: { value: company === 'A' ? 1 : 2, outputUnit: 'CNYm', sourceRefs: refs(`${company}-sensitivity`) }, qualitativeDependency: 'Shipment volume changes flow through the disclosed shipment revenue base.' })

test('calculates explicit industry-driver to company financial implication', () => {
  const result = calculateCompanyIndustryExposureBridge({ companyRef: 'company:A', industryRef: 'industry:hardware', asOf: '2026-09-21T00:00:00.000Z', items: [item('A', 0.1)] })
  assert.equal(result.status, 'complete')
  assert.equal(result.items[0]?.financialImpact?.value, 10)
  assert.match(result.items[0]?.financialImpact?.formula ?? '', /100.*0.1.*1/)
})

test('same industry can produce different company implications from different exposure and sensitivity', () => {
  const a = calculateCompanyIndustryExposureBridge({ companyRef: 'company:A', industryRef: 'industry:hardware', asOf: '2026-09-21T00:00:00.000Z', items: [item('A', 0.1)] })
  const b = calculateCompanyIndustryExposureBridge({ companyRef: 'company:B', industryRef: 'industry:hardware', asOf: '2026-09-21T00:00:00.000Z', items: [item('B', 0.1)] })
  assert.notEqual(a.items[0]?.financialImpact?.value, b.items[0]?.financialImpact?.value)
})

test('missing exposure, delta, or sensitivity remains qualitative and never receives a synthetic impact', () => {
  const result = calculateCompanyIndustryExposureBridge({ companyRef: 'company:saas', industryRef: 'industry:software', asOf: '2026-09-21T00:00:00.000Z', items: [{ ...item('SaaS', 0.1), exposure: { ...item('SaaS', 0.1).exposure, value: undefined }, sensitivity: undefined }] })
  assert.equal(result.status, 'complete')
  assert.equal(result.items[0]?.financialImpact, undefined)
  assert.equal(result.qualitativeDependencies.length, 1)
})
