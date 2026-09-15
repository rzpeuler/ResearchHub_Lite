# Industry Evidence Routing and TEST-054 Report

Date: 2026-09-15
Task: RHL-P3-INDUSTRY-ROUTING

## Scope

The Industry production path needed a deterministic way to route the approved
MIIT PCB definition anchors into the mandatory `industry_definition` module.
Wave 2 also needed to retain the workflow's actionable gap terms while keeping
the caller's bounded base search terms. Provider telemetry needed to preserve
one provider row across waves and distinguish normalized usable sources from
qualified evidence.

No provider, Knowledge schema, Gateway, Writer, Pi runtime, or frontend
architecture was changed.

## Implementation

- MIIT PCB definition anchors now carry the explicit
  `moduleHints: ['industry_definition']` metadata.
- Industry acquisition uses the caller's base terms on wave 1 and the bounded
  union of workflow gap terms plus base terms on later waves.
- Provider outcomes aggregate by provider across waves without dropping the
  first-wave identity or double-counting failure state.
- TEST-054 assembly records usable-source counts separately from qualified
  evidence counts, records module evidence IDs, and validates canonical reload
  against the actual V04 object values.
- Focused tests cover anchor routing, deterministic wave-2 terms, telemetry,
  provenance, and the complete Industry workflow contract.

## Validation

Passed:

- Focused Industry tests: 65/65.
- `npm run typecheck`.
- `npm run client:typecheck`.
- `npm run client:build`.
- `npm run document-parser:check` (`READY`).
- Full `npm test`: 972/972 Node tests and 21/21 client tests.

## Fresh TEST-054 live result

The real run completed through the production reasoning path and returned a
truthful evidence-limited result:

- parser preflight: `READY`;
- two acquisition waves, with the second wave caused by actionable gaps;
- MIIT: 6 fetched and normalized, 3 qualified, with 2 routed to
  `industry_definition`;
- all eight module calls executed once;
- Gateway: 1 submission; ChangeSet: 1; Writer: 1;
- canonical reload validation: `passed`;
- report: generated and validated with all 16 frozen sections;
- durable proposals: 12, each with raw source provenance;
- final classification:
  `INDUSTRY_PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE`.

The remaining classification is not a routing, parser, model-runtime, or
durable-write failure. The live public-provider portfolio supplied no
qualified evidence for the other seven modules during this run; those modules
remain explicit gaps in the report. The implementation therefore does not
weaken evidence gates or claim full Industry acceptance.

## Follow-up gate

Industry Phase 3 remains open until a real public-data run supplies evidence
for the eight-module product-quality acceptance and a second research target
verifies basic workflow generality. The next implementation decision should be
driven by a reproducible provider/source gap, not by fabricating evidence or
loosening qualification.
