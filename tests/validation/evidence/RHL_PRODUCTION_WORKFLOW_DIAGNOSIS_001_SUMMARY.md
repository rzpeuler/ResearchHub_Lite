# RHL-DIAGNOSE-PRODUCTION-WORKFLOW-FAILURE-001

Diagnosis Classification: **PRODUCT_DEFECT**

- Baseline: {"head":"f5676c81db18c1599ffa8459ad98dc0c9eb14a82","originMain":"f5676c81db18c1599ffa8459ad98dc0c9eb14a82","expected":"f5676c81db18c1599ffa8459ad98dc0c9eb14a82","matchesExpected":true,"trackedWorkingTreeClean":false}
- Provider/model: zhipu-openapi / glm-5.3-flash
- Reproduction: fresh KB, real Docling, real PiReasoningExecutor, Attachment -> /api/production/ingest -> /api/workflows/:runId
- Path boundary forensic (boolean only): {"runtimeProductionWorkspaceSame":true,"attachmentInsideRuntimeWorkspace":true,"attachmentInsideProductionWorkspace":true,"attachmentOutsideCanonicalKnowledge":true,"attachmentPathMatchesResolvedPath":false,"resolvedAttachmentInsideProductionWorkspace":false}
- Workflow identity: runId=84109474-f5f6-462e-a1d4-ab57fa897088; initial={"runId":"84109474-f5f6-462e-a1d4-ab57fa897088","workflowType":"raw_document_knowledge_ingestion","objective":"rhl-production-e2e-001.pdf","status":"running","progressSummary":"raw_document_knowledge_ingestion is running","startedAt":"2026-09-07T13:44:43.547Z","updatedAt":"2026-09-07T13:44:43.548Z"}; terminal=failed; durationMs=5
- Terminal failure: progress="Workflow failed"; errorSummary={"present":true,"category":"deterministic_production_failure","safeMessage":"workspaceFile must remain inside workspaceRoot and outside the canonical Knowledge Base"}
- Reasoning trace: []
- Failure phase: INPUT_RESOLUTION
- Raw archive: {"directoryPresent":false,"fileOrDirectoryCount":0,"rawRefs":[]}
- Ingestion log: {"present":false}
- Canonical Knowledge: {"revision":0,"counts":{"themeGroups":0,"entities":0,"relations":0,"claims":0,"sources":0,"modules":0},"validation":"passed"}
- Review: {"count":0,"source":"sanitized ingestion log metadata"}

Root cause: AttachmentService returned a canonical attachment path that ProductionService rejected against its lexical workspace boundary on Windows; the failure is deterministic INPUT_RESOLUTION path canonicalization/wiring

Production files modified: NONE
Validation files modified: diagnostic helper, deterministic tests, targeted reproduction, evidence, governance

Secret hygiene: credentialValuesExposed=false; authHeadersExposed=false; rawHiddenReasoningIncluded=false

CTO acceptance: PENDING CTO REVIEW
No production fix was implemented.
