# ResearchHub_Lite Changelog

## 2026-09-07

- Implemented Knowledge Graph Projection v0.1 and admitted the frozen architecture artifact byte-for-byte.
- Added bounded deterministic Directory and rooted graph read APIs.
- Replaced the `/graph` placeholder with a read-only React Flow + Dagre page with search, filters, depth, focus/re-root, URL state, and canonical Inspector detail.
- Added service, runtime, client, and regression coverage without changing canonical Knowledge mutation authority.

Graph Page v0.1 status: implemented / awaiting CTO acceptance.

- Executed `RHL-VALIDATE-PRODUCTION-E2E-001` with a validation-only harness and fresh-KB/real-Docling preflight.
- Recorded `ENVIRONMENT_BLOCKED` at real Pi provider completion preflight; no production implementation was modified and no faux/mock component was used to claim success.

Production Application E2E status: executed / awaiting CTO acceptance; rerun requires a working configured real Pi provider credential.
