# Earnings Review Skill

Earnings Review maintains an already-covered Schema 0.4 company after one exact fiscal reporting period.

The Skill interprets bounded official filing excerpts, deterministic period-scoped financial metrics, and company-only existing Claims. Code owns period matching, numeric normalization, derived calculations, reference validation, and durable eligibility. The model cannot allocate canonical IDs, invent metrics, infer consensus, or authorize Knowledge mutation.

The only reasoning operation is `earnings_review_synthesis`. Its request explicitly supplies allowed source IDs, canonical Claim refs, disposition/claim-type enums, deterministic metric names and exact values, and all 14 section titles. Invalid structured output receives at most one bounded repair request containing the normalized prior output and sanitized deterministic shape diagnostics; otherwise the Workflow emits deterministic gap sections and submits no unauthorized proposals.

Financial-quality rules:

- Financial-quality conclusions may use only deterministic metrics actually
  supplied by code.
- Missing working-capital, accrual, or cash-conversion inputs remain
  unavailable; the model must not invent a numeric quality metric.
- Revenue-recognition divergence is a bounded follow-up research flag, not a
  conclusion of fraud or manipulation.
- Consensus is never inferred when attributable point-in-time evidence is
  absent.
- Deterministic financial-quality calculations now exist for explicit raw
  revenue, COGS, balance-sheet, cash-flow, and asset inputs. They remain
  report-only in W1-003; missing inputs remain unavailable and code owns all
  arithmetic.
- Revenue-recognition outputs are bounded follow-up diagnostics, not fraud or
  earnings-manipulation conclusions. The current consensus rule and Knowledge
  mutation authority remain unchanged.
