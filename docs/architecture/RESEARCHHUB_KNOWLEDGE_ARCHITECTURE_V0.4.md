# ResearchHub Knowledge Architecture v0.4

Status: implemented and acceptance-verified on 2026-09-18.

Schema 0.4 is the first-class canonical Knowledge contract for structured research state. Schema 0.3 / Storage Format 1 remains a readable legacy input and compatibility surface. A v0.3 Knowledge Base is never silently rewritten; migration is an explicit dry-run or isolated apply operation.

## Boundaries

Workflow owns deterministic lifecycle, routing, cancellation, bounds, and terminal state. Skill owns research methodology and semantic proposal production. Plugin owns external capability integration and normalized acquisition. Knowledge owns identity, validation, provenance, ChangeSet construction, atomic Writer application, reload, query, and durable ReviewCase state.

No custom Agent Runtime, generic Provider/Capability/Planner layer, second database, graph database, vector/RAG subsystem, or Pi RPC boundary is introduced. Graph remains a projection. Canonical mutation remains Gateway -> Validation -> Resolution -> ChangeSet -> Writer.

## Canonical model

Existing v0.3 kinds remain available: ThemeGroup, Entity, Relation, Claim, Source, Module, and RawRef. v0.4 adds:

- Event: a typed occurrence attached to Entity subjects, temporal fields, participants, and Source evidence.
- Observation: a typed Metric, Estimate, or Consensus record. Metric values use a registry MetricRef; estimates identify institution, optional analyst, fiscal period, publication time, and revision; consensus records contributors and derived statistics.
- Thesis: a durable investment proposition with status, review timestamps, and Entity subjects.
- ReasoningEdge: a constrained, typed dependency from Observation or Claim to Claim or Thesis. It is an explainability relation, not a replacement for the v0.3 business Relation projection.

Person, Institution, and Security are explicit Entity types. Security requires ticker, exchange, and securityType. Institution can carry a bounded institutionType. ExternalIdentifier is structured as namespace, value, validity interval, optional Source, and confidence; opaque metadata is not used as the identity contract.

Source retains raw references and now carries rights, usage policy, acquisition metadata, provider, canonical URL, retrieval time, and content hash. Rights are evaluated before derived canonical Knowledge is created. `derivativeKnowledgeAllowed: false` blocks the complete production submission and leaves canonical state unchanged.

Temporal fields distinguish the research point (`asOf`), historical occurrence/report/publication time, and system recording time. They are not interchangeable. Query exposes a bounded `getKnowledgeAsOf` view and does not mutate canonical state.

## Six schema walkthroughs

1. Company Research resolves one hard-identity Company by normalized ticker and exchange. It may add Security and Person/Institution entities, then binds evidence-backed Claims and Observations to the Company.
2. Industry Research resolves an Industry Entity and uses Relations for supply-chain or competitive topology. Industry-level facts remain Claims/Observations; an unverified mention does not become a canonical Entity.
3. Earnings Review creates an `earnings_release` Event, reported Metric Observations for the historical fiscal period, Claim evidence, and optional first-class Thesis/ReasoningEdge updates. Acquisition time is stored on Source and is distinct from the reported period. A legacy `claimType: thesis` may be read or migrated, but new v0.4 writes must use Thesis.
4. Event Research may represent a verified occurrence as Event with occurrence/announcement time, participant Entities, and Source refs. Signals and unverified news remain workflow artifacts until the evidence gate is satisfied.
5. Estimate/Consensus Research creates institution-scoped Estimate Observations and a Consensus Observation whose contributor refs, count, mean, and `asOf` are explicit. A consensus is not a free-floating number.
6. Investment Thesis Research creates a Thesis and connects supporting, qualifying, or challenging Claims/Observations through ReasoningEdge. A Thesis is not overloaded into a Claim subtype, and an unresolved semantic decision is persisted as ReviewCase.

## Production and migration invariants

Every new canonical kind follows Proposal -> validated semantic binding -> deterministic ID -> ChangeSet validation -> atomic Writer -> reload. Proposal IDs are local and never become canonical IDs. A Writer commit either applies the validated ChangeSet or leaves the prior revision intact.

The v0.3 -> v0.4 migration supports `dry_run` and explicit isolated `apply`. It preserves canonical object IDs, Claim provenance, Source raw references, source revision as an audit input, and raw archive bytes by copy. Apply requires a new empty output directory and never changes the source directory. Repeating the same migration into an existing non-empty destination is rejected.

## Compatibility and read model

ResearchBundle remains a transport envelope for workflow results and proposal candidates; it does not become a second canonical store. The v0.4 loader and `KnowledgeIndexV04` read all canonical kinds, resolve references, traverse bounded references, and support as-of reads. The application Knowledge Service exposes the new kinds while retaining its v0.3 behavior. Existing Graph services continue to project only graph-compatible Entity/Relation topology.

## Semantic sanity check

The implementation uses the existing acquisition vocabulary and fixture-backed contracts for official earnings releases, structured data, news/RSS, institution estimates, and company/security identity. The acceptance fixture checks that revenue is a reported Metric Observation, EPS estimates are institution-scoped, consensus is contributor-backed, an earnings release is an Event, and a Thesis is connected through typed ReasoningEdge. Attention/social signals remain non-canonical workflow inputs unless a future typed Observation extension is explicitly designed and accepted.

The deterministic acceptance command is `npm run acceptance:knowledge-v04`; its evidence contains only schema/version, counts, deterministic refs, revisions, K1-K10 booleans, and privacy flags.
