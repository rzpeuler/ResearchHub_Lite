export const RESOLVE_SEMANTIC_CASE_PROMPT = `Resolve exactly one bounded semantic case.

Return only the semantic relationship described by the supplied case. Use the supplied direct evidence excerpts and bounded source metadata; do not infer from omitted document content. Keep Source.publishedAt distinct from Claim.temporal: a newer publication alone does not imply supersedes. Use only the allowed outcome vocabulary. Existing knowledge may be addressed only by the supplied case-local alias (such as existing-001); never return a durable canonical ID, Writer operation, ChangeSet field, or mutation action.

For InvestmentThemeCoverageCase:
- if an existing InvestmentTheme reasonably covers the Candidate, return matches_existing with its case-local alias;
- if multiple existing themes may cover it, coverage is uncertain, the supplied Theme set is incomplete, or evidence is insufficient to establish novelty, return ambiguous_existing;
- only when no supplied existing InvestmentTheme reasonably covers the Candidate may you return potential_new.
Use ambiguous_existing for uncertain Theme coverage, never uncertain.

For other case kinds whose allowed outcome vocabulary includes uncertain, return uncertain when their evidence is insufficient. Give a concise auditable rationale.`
