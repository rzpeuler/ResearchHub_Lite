# Earnings Review Skill

Earnings Review maintains an already-covered Schema 0.4 company after one exact fiscal reporting period.

The Skill interprets bounded official filing excerpts, deterministic period-scoped financial metrics, and company-only existing Claims. Code owns period matching, numeric normalization, derived calculations, reference validation, and durable eligibility. The model cannot allocate canonical IDs, invent metrics, infer consensus, or authorize Knowledge mutation.

The only reasoning operation is `earnings_review_synthesis`. Its request explicitly supplies allowed source IDs, canonical Claim refs, disposition/claim-type enums, deterministic metric names and exact values, and all 14 section titles. Invalid structured output receives at most one bounded repair request containing the normalized prior output and sanitized deterministic shape diagnostics; otherwise the Workflow emits deterministic gap sections and submits no unauthorized proposals.
