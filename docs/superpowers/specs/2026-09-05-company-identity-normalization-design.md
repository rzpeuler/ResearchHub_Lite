# Company Identity Normalization & Document-local Canonicalization v0.1

## Scope

Implement deterministic Company identity normalization before document-local consolidation. The change is limited to explicit securities decorations, conservative bilingual display labels, exact names/aliases, and existing `(exchange, ticker)` identity behavior. It does not migrate historical runtime Knowledge Bases or change Schema 0.3, Writer, durable ID allocation, or reasoning operations.

## Chosen approach

Use a narrow pure normalizer in `skills/knowledge-curation/company-identity.ts`, invoked by Candidate validation before an EntityCandidate is accepted. Extend the Curation Schema Context with an Entity contract derived from `KNOWLEDGE_SCHEMA_V03.entity.company.optionalFields`; expose only `ticker`, `exchange`, and `legalName` for Company. Keep the JSON output contract simple and make deterministic validation the authority.

In document-local consolidation, normalize every accepted Company Candidate first, then apply these deterministic phases:

1. Group complete `(normalized exchange, normalized ticker)` hard keys.
2. Attach an unkeyed Candidate only when its exact normalized name/alias labels match exactly one hard-key group.
3. Route an unkeyed Candidate matching multiple hard-key groups to a blocking `reconciliation_review` with the prescribed ambiguity rationale.
4. Consolidate remaining unkeyed Companies only through exact normalized name/alias overlap.

Different complete hard keys never share an automatic group. The canonical display name is selected by normalized whitespace, lack of securities decoration, shorter normalized label, then deterministic lexical order. Every other observed name is preserved as an alias, with semantic deduplication and removal of the selected canonical name.

## Normalization rules

- Parse only clear trailing full-width or half-width securities decorations such as `（300236.SZ）`, `(688549.SH)`, and `（833189.NQ）`.
- Normalize explicit exchange aliases only through the finite mapping `SH`, `SZ`, `BJ`, `NQ`, with supported aliases `SSE`, `SZSE`, `BSE`, and `NEEQ`.
- Remove parsed ticker/exchange decoration from Company `name` and place the values in `semanticFields`.
- If supplied `ticker`/`exchange` disagrees with parsed decoration, reject the Candidate as `invalid_semantics`; equal values are retained.
- Convert a trailing ASCII-only parenthetical label containing letters to an alias only when it is not a securities code and contains no CJK characters.
- Do not split CJK parenthetical qualifiers or slash labels.
- Company semantic fields accept only string `ticker`, `exchange`, and `legalName`; empty strings are treated as absent and are not persisted. Non-Company Candidates cannot use these fields.

## Unchanged boundaries

Knowledge Resolution keeps exact Company hard-key binding as the only global hard proof. Name/alias-only matches remain plausible signals. No fuzzy matching, external company database, vector search, new semantic case, Schema change, Writer change, ID allocator change, or historical KB mutation is introduced.

## Verification

Offline tests cover stock-code parsing, case normalization, agreement and contradiction, bilingual/CJK/slash behavior, field vocabulary and types, same/different hard-key consolidation, unique and ambiguous unkeyed attachment, alias preservation, Relation/Claim reference convergence, existing-KB binding, and untouched durable ID behavior. Required commands are `npm run typecheck`, `npm test`, `git diff --check`, and `npm audit --omit=dev`.
