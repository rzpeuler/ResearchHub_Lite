# Valuation Skill

Use deterministic market and financial inputs to construct the bounded valuation basis, eligibility checks, Bear/Base/Bull scenarios, and sensitivity output. Recompute arithmetic in code, keep consensus and deferred DCF explicit when unavailable, and allow semantic reasoning only for bounded assumptions and synthesis. Canonical IDs, numeric facts, proposals, and Knowledge mutation remain outside the Skill.

Internal deterministic DCF primitives now exist under the Skill's calculation
module, but DCF remains unavailable in the current Valuation v0.1 product
path. Product use requires an explicit input-readiness gate and integration
decision.

Methodology rules:

- The point-in-time basis, valuation date, reporting period, and publication
  status must be explicit.
- Code is the arithmetic authority. The model may select eligible methods and
  explain assumptions, but it may not author target-price arithmetic.
- Peer and reference inputs must be real and attributable; hidden defaults,
  fabricated peers, and fabricated consensus are prohibited.
- Missing inputs fail closed as unavailable. DCF remains unavailable/deferred
  in the current Valuation v0.1 product path until deterministic calculation
  and input-readiness gates are integrated.
- Future deterministic DCF must use gross debt in WACC weights and cash only
  in the enterprise-to-equity bridge.
- Sensitivity results must be recomputed from explicit inputs, never
  interpolated or model-authored.
- The current product scope remains PE, PB, and EV/EBITDA; this methodology
  does not expose DCF as a current ValuationMethod.
