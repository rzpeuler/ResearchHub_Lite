# RHL-FIX-ATTACHMENT-PRODUCTION-PATH-BOUNDARY-001

Path Fix Classification: **ATTACHMENT_PRODUCTION_PATH_DEFECT_FIXED**

- Baseline: {"head":"34615e72b459fb2706da3b586e8d6994279412f8","originMain":"34615e72b459fb2706da3b586e8d6994279412f8","expected":"34615e72b459fb2706da3b586e8d6994279412f8","matchesExpected":true,"trackedWorkingTreeClean":false}
- Provider/model: zhipu-openapi / glm-5.3-flash
- Reproduction: fresh KB, real Docling, real PiReasoningExecutor, Attachment -> /api/production/ingest -> /api/workflows/:runId
- Path boundary forensic (safe type/boolean only): {"runtimeProductionWorkspaceSame":true,"canonicalAttachmentPathPresent":true,"productionWorkspaceReference":"uploads/851039a6-5d91-42b6-bd80-ee8ab0779901/rhl-production-e2e-001.pdf","workspaceReferenceRelative":true,"workspaceReferenceResolvesInsideRuntimeWorkspace":true,"workspaceReferenceResolvesInsideProductionWorkspace":true,"workspaceReferenceOutsideCanonicalKnowledge":true}
- Workflow identity: runId=a0f29cc1-1a61-443b-b324-e3fb9f601e4a; initial={"runId":"a0f29cc1-1a61-443b-b324-e3fb9f601e4a","workflowType":"raw_document_knowledge_ingestion","objective":"rhl-production-e2e-001.pdf","status":"running","progressSummary":"raw_document_knowledge_ingestion is running","startedAt":"2026-09-07T14:00:23.615Z","updatedAt":"2026-09-07T14:00:23.616Z"}; terminal=completed_with_review; durationMs=202642
- Terminal outcome: progress="Document ingestion completed with ReviewCases"; errorSummary=null
- Reasoning trace: [{"operation":"understandAndPlan","startedAt":"2026-09-07T14:00:31.352Z","durationMs":48031,"status":"passed"},{"operation":"extractKnowledge","startedAt":"2026-09-07T14:01:19.385Z","durationMs":56023,"status":"passed"},{"operation":"extractKnowledge","startedAt":"2026-09-07T14:01:19.385Z","durationMs":146753,"status":"passed"}]
- Failure phase: NONE
- Raw archive: {"directoryPresent":true,"fileOrDirectoryCount":1,"rawRefs":[{"rawRef":"raw-sha256-b7b3becbc413e368482c5bf5a593f55c34c65253d4f6e4f03382ab57487aa2ee","integrityValid":true,"contentHashMatches":true,"sizeBytes":886}]}
- Ingestion log: {"present":true,"parseable":true,"status":"completed_with_review","workflowRunId":"a0f29cc1-1a61-443b-b324-e3fb9f601e4a","rawRef":"raw-sha256-b7b3becbc413e368482c5bf5a593f55c34c65253d4f6e4f03382ab57487aa2ee","documentId":"document-b7b3becbc413e368","changeSetIdPresent":true,"committedRevision":1,"reviewSummary":{"total":6,"rootCount":6,"dependencyCount":0},"reviewCaseCount":1,"errorCodes":[],"errorCategories":[]}
- Canonical Knowledge: {"revision":1,"counts":{"themeGroups":0,"entities":4,"relations":2,"claims":4,"sources":1,"modules":0},"validation":"passed"}
- Review: {"count":1,"source":"sanitized ingestion log metadata"}

Root cause: Workflow completed without a new authoritative failure

Production files modified: AttachmentService workspace-reference accessor, Runtime Server handoff
Validation files modified: diagnostic helper, deterministic tests, targeted reproduction, evidence, governance

Secret hygiene: credentialValuesExposed=false; authHeadersExposed=false; rawHiddenReasoningIncluded=false

CTO acceptance: PENDING CTO REVIEW
Full Production E2E was not run.
