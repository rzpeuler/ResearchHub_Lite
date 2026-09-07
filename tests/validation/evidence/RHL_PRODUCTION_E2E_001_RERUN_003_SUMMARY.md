# RHL-VALIDATE-PRODUCTION-E2E-001-RERUN-003

Classification: **SUCCESS**

- Previous run: RHL-VALIDATE-PRODUCTION-E2E-001-RERUN-002: VALIDATION_HARNESS_DEFECT / CTO reviewed
- Current run: SUCCESS
- Failure stage: none
- Baseline: HEAD=e073827a08104f1543ba1f53ddfa4fe58ae7c472; origin/main=e073827a08104f1543ba1f53ddfa4fe58ae7c472
- Offline regression: {"rootTypecheck":"PASS","clientTypecheck":"PASS","clientTests":"PASS","clientBuild":"PASS","npmTest":"PASS","audit":"PASS","diffCheck":"PASS","note":"Executed before the real E2E invocation on the accepted baseline"}
- Provider/model: zhipu-openapi / glm-5.3-flash; real=true; faux/mock=false
- Free Research: accepted=true; SSE=true; assistantDeltaNonEmpty=true; terminal=completed; clientErrors=0; persistedUser=true; persistedAssistant=true; nonceInUser=true; normalizedSafe=true; rawHiddenReasoning=false
- PDF: rhl-production-e2e-001.pdf; bytes=886; SHA-256=b7b3becbc413e368482c5bf5a593f55c34c65253d4f6e4f03382ab57487aa2ee; pages=1
- Fresh KB: kb-rhl-production-e2e-001; revision 0 -> 1; initial={"themeGroups":0,"entities":0,"relations":0,"claims":0,"sources":0,"modules":0}; final={"themeGroups":0,"entities":4,"relations":2,"claims":3,"sources":1,"modules":0}
- Attachment: id=cec557a1-178a-4011-950f-0e2978fe3898; upload=true; upload-only mutation=false
- Production start: {"runId":"b5a502a5-f6c6-4e10-a7d9-052835293fc5","initialStatus":"running","workflowType":"raw_document_knowledge_ingestion","objective":"rhl-production-e2e-001.pdf"}
- Production terminal: {"runId":"b5a502a5-f6c6-4e10-a7d9-052835293fc5","status":"completed_with_review","progressSummary":"Document ingestion completed with ReviewCases","reviewCount":1,"startedAt":"2026-09-07T14:24:56.306Z","updatedAt":"2026-09-07T14:29:19.886Z","completedAt":"2026-09-07T14:29:19.886Z"}
- Reasoning at terminal: {"calls":3,"successes":3,"failures":0,"operations":["understandAndPlan","extractKnowledge"],"peakConcurrency":2,"failureMetadata":[]}
- Production: run=b5a502a5-f6c6-4e10-a7d9-052835293fc5; terminal=completed_with_review; Docling=true {"parser":{"id":"docling-local","version":"2.116.0"},"stats":{"pageCount":1,"sectionCount":1,"blockCount":2,"normalizedCharacters":250,"tableCount":0,"headingCount":0,"listCount":0,"captionCount":0}}; reasoning=true calls=3; Writer=committed
- Knowledge API: {"searchHttp":200,"searchResultCount":1,"rootObjectHttp":200,"rootRef":"entity:company-validation-company","rootKind":"Entity","correspondsToCanonicalEntity":true}
- Graph API: {"directoryHttp":200,"directoryHasRoot":true,"rootRef":"entity:company-validation-company","profile":"company_context","nodes":3,"edges":2,"depthOne":1,"depthTwo":2,"depthTwoNodes":3,"selectedExpectedEdge":{"ref":"relation:4d6342710211fa5a","relationType":"offers_product","sourceRef":"entity:company-validation-company","targetRef":"entity:product-validation-product","label":"offers product"},"canonicalDirectionPreserved":true,"claimTopology":false,"sourceTopology":false,"reviewTopology":false,"graphNodeKinds":["company","product","technology"],"bounded":true}
- Browser smoke: {"method":"Edge/CUA","pages":["research","graph","reviews"],"fatalRuntimeErrors":0}
- Replay: {"secondProductRun":"83b6a56e-b8eb-4d3f-b554-cf1f7e708d8d","terminalStatus":"blocked","reasoningCallDelta":8,"writerResult":"revision_unchanged","revisionBeforeReplay":1,"revisionAfterReplay":1,"countsChanged":false,"duplicateCanonicalContent":false}
- Security: {"loopbackOnly":true,"sameOrigin":true,"wildcardCors":false,"mutationTokenRequired":true,"readEndpointWithoutToken":true,"canonicalKbStaticallyExposed":false,"workspaceStaticallyExposed":false,"piStaticallyExposed":false,"corsHeader":"http://127.0.0.1:59553"}

Evidence contains no API keys, auth headers, runtime tokens, private filesystem secrets, raw hidden reasoning, or raw tool payloads.

CTO acceptance: PENDING CTO INDEPENDENT ACCEPTANCE
Next recommended task: Do not start another task automatically; wait for CTO review.
