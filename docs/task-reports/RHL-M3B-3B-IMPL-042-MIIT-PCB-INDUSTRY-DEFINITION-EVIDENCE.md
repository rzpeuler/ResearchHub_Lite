# RHL-M3B-3B-IMPL-042 — MIIT PCB Industry Definition Evidence

## Acceptance

TEST-041 is accepted as completed with `tests_status=FAILED`: its offline assembly gate and implementation/report artifacts exist, while the unrelated `VAL-HTTP-001` aggregate failure remains test evidence only. Sol acceptance overrides its final product classification to `PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE`.

The committed TEST-041 evidence records a valid blocked Workflow: two acquisition waves, zero Gateway submissions, zero revision delta, and a syntactically valid Industry Definition result whose `evidenceIds` are empty. FIX-039 is effective; the local `pcb-industry-definition-evidence` gap ID is valid. The model conservatively declined unsupported inference because no qualified definition evidence was supplied. This is not a runtime or model failure.

The historical TEST-041 report and classifier were not modified. Its assembler derives `liveInconclusive` from non-completion before the evidence-blocked branch, so it misclassified this conservative valid blocked result.

## Evidence and source-selection rationale

The P0 gap was narrow: authoritative evidence had to establish PCB Manufacturing's definition, scope, inclusion boundary, and exclusion boundary. The implementation therefore adds only a bounded target-aware anchor set to the existing MIIT provider. The anchors do not claim market size, supply-demand, company exposure, technology roadmap, or other module coverage.

Approved anchors, all official MIIT URLs and tier-1 public personal-noncommercial sources:

1. `https://wap.miit.gov.cn/cms_files/filemanager/oldfile/miit/n1146295/n1652858/n1652930/n4509607/c6577041/part/6577143.pdf` — 印制电路板行业规范条件.
2. `https://www.miit.gov.cn/cms_files/filemanager/oldfile/miit/n1146285/n1146352/n3054355/n3057643/n3057649/c6576614/part/6576630.pdf` — 印制电路板行业规范公告管理暂行办法.
3. `https://www.miit.gov.cn/zwgk/zcwj/wjfb/gg/art/2024/art_aae4295d7b924abeabe37d8bcf47be53.html` — 中华人民共和国工业和信息化部公告2024年第46号, current-validity context.

## Implementation design

`MiitIndustryResearchPlugin` exports the fixed anchor metadata and activates it only when the normalized name, aliases, or search terms contain a bounded PCB identity form: `PCB`, `Printed Circuit Board`, `printed circuit boards`, `印制电路板`, or a bounded phrase containing those forms. Unrelated industries do not receive the anchors. No provider, registry, crawler, search service, orchestration layer, Workflow abstraction, or production document text was added.

Anchor candidates are ordinary `ResearchSourceCandidate` values owned by `miit`, with deterministic `miit-${sha256(canonicalUrl)}` IDs, tier 1, official MIIT hosts, bounded metadata, and the existing rights policy. They are merged with normal list discovery by canonical URL, filtered by publication date against `asOf`, ordered ahead of lower-value list candidates, and then included in the existing maximum of eight candidates. Normal non-PCB list discovery remains unchanged.

Anchors pass through the existing MIIT request, fetch, and `DocumentInputResolver` normalize path. No prewritten Evidence, Claim, Relation, report text, or Knowledge object is injected into production code. Default tests use local fixtures and make zero external network calls.

## Offline proof

The MIIT plugin tests prove deterministic discovery for PCB Manufacturing, Printed Circuit Board, and 印制电路板; unrelated-target isolation; future-anchor exclusion by `asOf`; canonical URL deduplication; deterministic IDs; tier-1 official-domain metadata; and mock PDF/HTML fetch-normalize provenance and rights. The PDF fixture contains representative scope text showing PCB production enterprises in scope and dedicated equipment/material manufacturing outside the management scope; it is test material only.

The Workflow regression supplies the normalized MIIT definition source through the ordinary acquisition seam. Industry Definition receives `evidence-miit-definition-anchor`, returns supported, and the Workflow completes without the mandatory-definition block. It proves one Gateway submission, a sixteen-section report, revision delta no greater than one, and passing Schema 0.4 canonical validation.

## Modified files

- `plugins/research-acquisition/miit-industry.ts`
- `tests/plugins/research-acquisition/miit-industry.test.ts`
- `tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts`
- `docs/task-reports/RHL-M3B-3B-IMPL-042-MIIT-PCB-INDUSTRY-DEFINITION-EVIDENCE.md`

No files under `docs/governance/`, `docs/architecture/`, `.git/`, credentials, secrets, or private keys were changed. No live Codex or public-provider call was made.

## Validation

- `npx tsx --test tests/plugins/research-acquisition/miit-industry.test.ts` — passed, 12/12.
- `npx tsx --test tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts` — passed, 43/43 after the final assertion correction.
- `npm run typecheck` — passed.
- `npm test` — failed as evidence only: 924/925 passed; the sole failure is the out-of-scope historical `tests/app/runtime/valuation-route.test.ts` `VAL-HTTP-001` timing/state assertion (`actual=running`, `expected=blocked`).
- `git diff --check` — passed.

## Privacy and security review

The change retains HTTPS and MIIT-subdomain enforcement, redirect boundary checks, payload bounds, timeout behavior, deterministic URL identity, and existing normalization. It does not add credentials, cookies, authorization headers, unrestricted source chasing, raw-body logging, redistribution rights, or external network requirements to default tests.

## Recommended next step

Perform one fresh direct public-portfolio Industry product-quality TEST using the unchanged seven-provider production composition and a corrected classifier where a valid evidence-insufficient blocked Workflow maps to `PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE` rather than `LIVE_INCONCLUSIVE`.
