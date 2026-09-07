# RHL-VALIDATE-RESTART-REVIEW-PERSISTENCE-001

Classification: **VALIDATION_HARNESS_DEFECT**

- Baseline: {"expected":"9d52645c9492362afbfa2eb8cfce3202f0a0eb44","head":"9d52645c9492362afbfa2eb8cfce3202f0a0eb44","originMain":"9d52645c9492362afbfa2eb8cfce3202f0a0eb44","productWorkingTreeClean":true,"validationOnlyChanges":[" M package.json","?? \"20260805-\\350\\245\\277\\351\\203\\250\\350\\257\\201\\345\\210\\270-AI\\347\\256\\227\\345\\212\\233\\350\\241\\214\\344\\270\\232\\357\\274\\232AI\\347\\256\\227\\345\\212\\233\\344\\270\\212\\346\\270\\270\\346\\235\\220\\346\\226\\231\\344\\272\\247\\344\\270\\232\\351\\223\\276\\347\\240\\224\\347\\251\\266\\346\\212\\245\\345\\221\\212.pdf\"","?? tests/validation/evidence/RHL_RESTART_REVIEW_PERSISTENCE_001_SUMMARY.md","?? tests/validation/evidence/rhl-restart-review-persistence-001.json","?? tests/validation/restart-review-persistence-contract.test.ts","?? tests/validation/restart-review-persistence-contract.ts","?? tests/validation/restart-review-persistence.ts"],"protectedPdf":{"size":3209114,"sha256":"998703cef102300518bb2edcbcc3e9bc26fa374f157b0714f3986c5028d78d63","modified":false,"tracked":false},"previousRerun003RawEvidenceImmutable":true}
- Provider/model: {"provider":"zhipu-openapi","model":"glm-5.3-flash","real":true,"fauxOrMock":false,"parser":{"id":"docling-local","version":"2.116.0"}}
- Runtime A: {"lifecycleCreated":true,"serverCreated":true,"bootstrap":"PASS","sameKnowledgeBaseMounted":true}
- Production: {"runId":"9ffa3169-5e21-4b5c-bf46-e42e7f09b627","terminalStatus":"completed_with_review","reviewCount":0,"reasoningCalls":2,"reasoningSuccesses":2,"reasoningFailures":0,"realReasoning":true,"docling":{"id":"docling-local","version":"2.116.0"}}
- Review API Before Restart: {"listHttp":200,"total":0,"caseIds":[],"currentProductionRunFound":false,"noReviewGenerated":true,"permittedFreshFixtureRetryUsed":true}
- Canonical A: {"revision":1,"counts":{"themeGroups":0,"entities":4,"relations":3,"claims":0,"sources":1,"modules":0},"refHash":"160fb458a5b4cf2fa7cdf0ce0762c958f2b2ca0f08266b48cb0978790f2bcc8f","refCount":8,"validation":"PASS"}
- Raw A: {"rawRef":"raw-sha256-b7b3becbc413e368482c5bf5a593f55c34c65253d4f6e4f03382ab57487aa2ee","size":886,"sizeBytes":886,"contentHash":"sha256:b7b3becbc413e368482c5bf5a593f55c34c65253d4f6e4f03382ab57487aa2ee","integrity":true,"contentHashMatchesPdf":true,"storageManifestRead":true}
- Graph A: {"rootRef":"entity:company-validation-company","depthOne":{"nodeRefHash":"fa1af5428c75bf166bd2991c36cc5b32f66b58576f5c3b209b21cc6e36b2514e","edgeRefHash":"96fbbf9408a67d5eb06a076e70978b06b48602f48e498eb187c5f4e0f4ee5dca","nodeCount":4,"edgeCount":3},"depthTwo":{"nodeRefHash":"fa1af5428c75bf166bd2991c36cc5b32f66b58576f5c3b209b21cc6e36b2514e","edgeRefHash":"96fbbf9408a67d5eb06a076e70978b06b48602f48e498eb187c5f4e0f4ee5dca","nodeCount":4,"edgeCount":3},"canonicalDirectionChecked":true}
- Runtime B: {}
- Canonical Persistence: {}
- Raw Persistence: {}
- Knowledge API B: {}
- Graph Persistence: {}
- Review Persistence: {}
- Restart Persistence: {}
- Harness tests: {}
- Offline tests: {}

Evidence contains no API keys, OAuth tokens, runtime tokens, hidden reasoning, or raw model output.

RERUN-003 raw evidence remains immutable and is not rewritten.

The permitted fresh-fixture retry was used. No Runtime B restart was executed because the real Production terminal claimed `completed_with_review` while `reviewCount=0` and the Review API list contained no case for the current producer run. This is recorded as a Product contract defect; no automatic fix was made.

CTO acceptance: PENDING CTO INDEPENDENT ACCEPTANCE
