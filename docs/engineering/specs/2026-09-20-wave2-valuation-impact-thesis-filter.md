# Wave 2 — Valuation Impact and Thesis Filter

Status: `IMPLEMENTED / SOL ACCEPTANCE PENDING`

W2-005 consumes the report-only `EarningsExpectationAnalysis` produced by
W2-004. It normalizes each deterministic expectation comparison into an
`EarningsFinding`, maps the finding to affected valuation input categories,
and reports whether a valuation refresh is required.

The bridge is deliberately non-authoritative. It does not calculate target
price, multiples, DCF value, forecast values, or valuation assumptions. Those
remain owned by `workflows/valuation/**` and `skills/valuation/**`.

## Thesis filter boundary

The workflow reads only canonical Schema 0.4 `KnowledgeThesisV04`,
`KnowledgeReasoningEdgeV04`, `KnowledgeClaimV04`, and
`KnowledgeObservationV04` objects belonging to the resolved Company. A
dependency is eligible only when an existing ReasoningEdge points from that
Claim/Observation to an existing Thesis and the finding's metric/period is
relevant to the dependency. The output preserves the Thesis status and edge
identity for explanation, but it is report-only.

W2-005 never submits a Knowledge proposal, creates a Thesis or Claim, creates
or updates a ReasoningEdge, or changes Thesis lifecycle/status.

## FIX-001 semantic integrity rules

The valuation bridge uses only this explicit normalized metric map:

| Finding metric | Affected valuation input |
| --- | --- |
| `revenue` | `revenue` |
| `net_profit`, `eps` | `earnings` |
| `gross_margin`, `net_profit_margin` | `margin` |
| `operating_cash_flow`, `free_cash_flow`, `cash_flow` | `cash_flow` |
| `revenue_growth`, `earnings_growth`, `eps_growth` | `growth` |

Normalization is limited to trimming, lower-casing, and removing a leading
`metric:` prefix. Unknown metrics, segment labels, multiple, price, volume,
capacity, utilization, and synonyms do not map. A mapped nonzero finite
deterministic delta requires refresh; zero does not. Guidance boundary
relationships can require refresh without a numeric delta, while compatible
relationships do not. Guidance revisions retain each available low, high,
midpoint, and range-width dimension as a bounded list. Segment comparisons use
their explicit prior or expectation comparison delta.

The Thesis input is a bounded, schema-neutral projection: at most eight
eligible Company Theses and twelve direct active ReasoningEdge dependencies per
Thesis. Only active `active|strengthening|weakening|challenged` Theses are
eligible; invalidated, archived, inactive, unresolved, and transitive objects
are excluded. Deterministic relevance requires exact structured metric and,
when present, exact fiscal period. Text-only dependencies are semantic-only.
Criticality is code-owned: `depends_on` and `invalidates` are load-bearing;
other direct edges are direct. Deterministic effect remains `uncertain`.

The semantic operation receives every normalized finding, the complete bounded
context, and deterministic matches. Its output is validated against existing
finding, Thesis, and dependency identities, permits one repair, and preserves
deterministic matches. A successful explicit no-relation decision may classify
an item as `thesis_irrelevant`; unavailable or failed semantic resolution is
`uncertain` and never silently becomes irrelevant. No numeric score,
probability, magnitude, sign-derived effect, or valuation conclusion is
accepted from the semantic output.

## Report and telemetry

The existing `Valuation Implications` and `Thesis Impact` sections are enriched
after W2-004 synthesis. Expectation sources remain report evidence and do not
become canonical Sources solely because the bridge references them. Required
telemetry includes the aggregate valuation-refresh flag, Thesis context status and bounded
counts, filter finding count, and `thesis_critical`, `thesis_relevant`,
`thesis_irrelevant`, and `uncertain` classification counts. Legacy telemetry
fields remain for compatibility.
