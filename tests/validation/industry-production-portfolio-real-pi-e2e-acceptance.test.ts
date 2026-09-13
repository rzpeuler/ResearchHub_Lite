import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPortfolioAcceptance, semanticDuplicateAudit } from './industry-production-portfolio-real-pi-e2e-acceptance.ts'
const base:any={workflowStatus:'completed',realPi:true,moduleCount:8,sectionCount:16,gatewaySubmissions:1,revisionDelta:1,writerCommits:1,sourceRawProvenance:true,unsupportedNumericCount:0,replay:{liveModelCalls:0,liveProviderCalls:0,revisionDelta:0,duplicates:{entity:false,relation:false,claim:false,source:false}},privacy:true,usableSourceCount:2,providerCount:2,durableSemanticCount:1}
test('classifies a complete portfolio as accepted',()=>assert.equal(classifyPortfolioAcceptance(base),'PORTFOLIO_E2E_ACCEPTED'))
test('classifies one-source invariant-safe output as partial evidence accepted',()=>assert.equal(classifyPortfolioAcceptance({...base,usableSourceCount:1,providerCount:1}),'PORTFOLIO_E2E_PARTIAL_EVIDENCE_ACCEPTED'))
test('classifies a project invariant failure as production defect',()=>assert.equal(classifyPortfolioAcceptance({...base,sectionCount:15}),'PORTFOLIO_E2E_PRODUCTION_DEFECT'))
test('classifies external runtime failure as live inconclusive',()=>assert.equal(classifyPortfolioAcceptance({...base,workflowStatus:'failed',externalFailure:true}),'PORTFOLIO_E2E_LIVE_INCONCLUSIVE'))
test('duplicate audit detects new semantic objects',()=>{const a={objects:[{kind:'entity',value:{id:'entity:a',name:'a'}}]}; assert.equal(semanticDuplicateAudit(a,a).entity,false); assert.equal(semanticDuplicateAudit(a,{objects:[...a.objects,{kind:'entity',value:{id:'entity:b',name:'b'}}]}).entity,true)})
