# RHL-M3B-3B-FIX-039 — Industry Research Gap ID Contract Convergence

## Result

Implemented the deterministic contract correction at base `356c5e4327e8c29bac180e619f462ff8a3a06b27`. The Industry model-facing Research Gap contract now uses the same strict local-ID authority as Skill validation. The change is producer-neutral and does not alter acquisition, Workflow policy, Knowledge contracts, or repair limits.

TEST-038 remains the authoritative diagnostic evidence: the direct public-portfolio Workflow was blocked because mandatory Industry Definition remained unavailable after bounded repair and gap-fill, with multiple module attempts failing locally as `Invalid Research Gap`. TEST-037's earlier `undefined.some` TypeError did not reproduce on the direct production Workflow path and did not authorize a production fix. TEST-038 normalized-source metadata warnings are non-authoritative here; no acquisition provider or normalized-source contract was changed.

## Exact drift and implementation

Before FIX-039, `skills/industry-research/contracts.ts` exposed `ResearchGap.gapId` to the model as only a non-empty bounded string with a 120-character limit. The Skill validator independently required a local identifier. Thus a structured output could satisfy the model contract and fail local validation solely because its `gapId` contained spaces, a colon-delimited canonical-looking prefix, a leading digit, a slash, or non-ASCII identifier text.

`contracts.ts` now owns and exports `INDUSTRY_LOCAL_ID_PATTERN`, `INDUSTRY_LOCAL_ID_MAX_LENGTH`, and `isValidIndustryLocalId`. The shared gap schema uses that authority, and the existing `localId` schema for `proposalId`, `subjectKey`, and `targetKey` uses the same pattern and bound. `skill.ts` reuses the helper instead of maintaining a second regular expression. The semantics remain: first character ASCII letter; remaining characters ASCII letters, digits, dot, underscore, or hyphen; maximum 120 characters; canonical namespace identifiers are rejected.

Because the shared gap schema is referenced by Research Design `knownGaps`, module-analysis `gaps`, and cross-module-synthesis `gaps`, all three model-facing surfaces converge automatically. No gap meaning, limits, module membership, evidence rules, proposal rules, report material, structured-value behavior, canonical behavior, or repair count changed. The normalizer's existing provider compatibility behavior remains unchanged: it strips generation-only `pattern`/length keywords from the transport schema while retaining `additionalProperties: false`; the source contract remains the authoritative strict contract and local validation remains the final enforcement boundary.

## Regression coverage

- Valid local IDs `missing_market_size`, `gap-capacity-2026`, and `company.mapping` are accepted.
- Gap IDs with spaces, canonical-looking colon prefixes, leading digits, slashes, and non-ASCII text are rejected; the 120-character boundary is covered.
- Design `knownGaps`, module-analysis gaps, and synthesis gaps assert the same pattern and max length.
- Codex normalization tests assert the strict source contract on all three surfaces and retain the normalizer's `additionalProperties: false` behavior.
- Module analysis repairs a model-admitted invalid gap ID once, makes exactly two reasoning calls, and accepts the repaired local ID.
- Repeated invalid initial and repair candidates fail closed after the existing single repair attempt and return the existing unavailable result without synthetic semantic recovery.
- Research Design and cross-module validation continue to use the shared authority through their existing validators.
- An offline fresh Schema 0.4 / Storage Format 1 Workflow test makes the first Industry Definition result use an invalid gap ID, repairs it to a valid local ID, clears the mandatory Industry Definition boundary, completes one Gateway submission and sixteen-section report, and preserves one Knowledge revision.

## Intentional snapshots

The corrected source contract intentionally changed the directly affected deterministic snapshots only:

- Design source hash: `9854f93073c44d96` → `b2d53042cd0f2b88`.
- Design normalized fingerprint/bytes: `88711c17a6837ae7` / `2125` → `2ff5ce2b631ceb26` / `2243`.
- Industry module contract JSON byte count: `6203` → `6359`.
- Industry module normalized fingerprint/bytes: `37f55ba9cafed372` / `4558` → `992306492c86ef0c` / `4676`.

These updates reflect only the shared `gapId` schema correction and its resulting serialized schema bytes. No snapshot assertion was weakened or deleted.

## Validation

- `npx tsx --test tests/skills/industry-research/industry-research-skill.test.ts tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts tests/plugins/reasoning/codex-cli.test.ts tests/validation/codex-module-remaining-schema-deltas.test.ts tests/validation/codex-production-industry-schema-compatibility.test.ts` — PASS, 102/102.
- `npx tsx --test tests/skills/industry-research/industry-research-skill.test.ts` — PASS.
- `npx tsx --test tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts` — PASS.
- `npx tsx --test tests/plugins/reasoning/codex-cli.test.ts` — PASS.
- `npx tsx --test tests/validation/codex-module-remaining-schema-deltas.test.ts` — PASS.
- `npx tsx --test tests/validation/codex-production-industry-schema-compatibility.test.ts` — PASS.
- `npm run typecheck` — PASS.
- `npm test` — 907/908 Node tests passed plus 21/21 client tests; one unrelated existing `VAL-HTTP-001` timing/state assertion failed (`running` observed, `blocked` expected) in `tests/app/runtime/valuation-route.test.ts`, outside FIX-039 scope.
- `git diff --check` — PASS.

No live Codex call, public provider call, TEST-037 rerun, or TEST-038 rerun was performed. Luna did not commit or push.

## Recommended next step

Run one fresh direct public-portfolio product-quality TEST using the current production providers and corrected `gapId` contract; do not add source providers before that evidence exists.
