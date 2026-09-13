import assert from 'node:assert/strict'
import test from 'node:test'
import { FROZEN_EASTMONEY_TARGET } from './eastmoney-industry-production-acquisition.ts'

test('focused validation target is frozen and bounded', () => { assert.deepEqual(FROZEN_EASTMONEY_TARGET, { name: 'PCB Manufacturing', alias: 'Printed Circuit Board', searchTerms: ['PCB 印制电路板', 'AI服务器 PCB HDI', '深南电路 PCB', '沪电股份 PCB', '胜宏科技 PCB', '生益科技 PCB CCL', 'PCB 产业链', 'PCB 行业 产能'], asOf: '2026-09-12T00:00:00.000Z' }); assert.equal(FROZEN_EASTMONEY_TARGET.searchTerms.length, 8) })
test('offline validation module does not run network on import', () => assert.ok(FROZEN_EASTMONEY_TARGET.name))
