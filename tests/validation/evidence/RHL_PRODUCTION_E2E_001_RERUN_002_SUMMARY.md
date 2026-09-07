# RHL-VALIDATE-PRODUCTION-E2E-001-RERUN-002

Classification: **PRODUCT_DEFECT**

- Previous run: RHL-VALIDATE-PRODUCTION-E2E-001-RERUN-001: VALIDATION_HARNESS_DEFECT / CTO reviewed
- Current run: PRODUCT_DEFECT
- Failure stage: production_workflow_poll
- Baseline: HEAD=e1ca3b4f18416545beec51ade13a92a975a5040e; origin/main=e1ca3b4f18416545beec51ade13a92a975a5040e
- Offline regression: {"rootTypecheck":"PASS","clientTypecheck":"PASS","clientTests":"PASS","clientBuild":"PASS","npmTest":"PASS","audit":"PASS","diffCheck":"PASS","note":"Executed before the real E2E invocation on the accepted baseline"}
- Provider/model: zhipu-openapi / glm-5.3-flash; real=true; faux/mock=false
- Free Research: accepted=true; SSE=true; assistantDeltaNonEmpty=true; terminal=completed; clientErrors=0; persistedUser=true; persistedAssistant=true; nonceInUser=true; normalizedSafe=true; rawHiddenReasoning=false
- PDF: rhl-production-e2e-001.pdf; bytes=886; SHA-256=b7b3becbc413e368482c5bf5a593f55c34c65253d4f6e4f03382ab57487aa2ee; pages=1
- Fresh KB: kb-rhl-production-e2e-001; revision 0 -> n/a; initial={"themeGroups":0,"entities":0,"relations":0,"claims":0,"sources":0,"modules":0}; final={}
- Attachment: id=e8c5a001-131f-4e2a-a92e-3f43e5c5108d; upload=true; upload-only mutation=false
- Production: run=not retained by the pre-classification failure path; terminal=failed; Docling=n/a {}; reasoning=n/a calls=n/a; Writer=n/a
- Knowledge API: {}
- Graph API: {}
- Browser smoke: {}
- Replay: {}
- Security: {}

Evidence contains no API keys, auth headers, runtime tokens, private filesystem secrets, raw hidden reasoning, or raw tool payloads.

CTO acceptance: PENDING CTO INDEPENDENT ACCEPTANCE
Next recommended task: Do not start another task automatically; wait for CTO review.
