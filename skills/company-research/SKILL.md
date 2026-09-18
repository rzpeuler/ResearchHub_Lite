# Company Research Skill

This ResearchHub Skill produces bounded structured research, Markdown-ready sections, and semantic proposals. It does not allocate canonical IDs, create ChangeSets, call Validation, or call Writer. Numerical valuation utilities are deterministic and must be used to recompute report numbers.

Methodology rules:

- Numerical valuation must be deterministic and attributable to supplied
  research inputs.
- Relative valuation requires a real, attributable peer set. Synthetic or
  default peer multiples are prohibited.
- When attributable peer inputs are absent, valuation is
  `insufficient_data`; the Skill must not invent a result or silently invoke
  the dedicated Valuation workflow.
- This Skill does not claim to perform full comps or DCF. It does not allocate
  canonical IDs or write Knowledge directly.
