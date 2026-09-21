# Catalyst Map

## Purpose

Map attributable future or completed events to the thesis propositions and
expectation gaps they can confirm, challenge, or resolve.

## Invocation Match

Use when the user asks which observable events will test an investment thesis.
Do not treat generic news, an unlinked event, or a bullish event list as a
catalyst map.

## Typical Intents

- “Which future events will validate this thesis?”
- “What event would resolve this uncertainty?”

## Inputs

A formalized thesis, optional expectation gaps, and bounded attributable event
evidence. The semantic stage identifies candidate event-to-proposition and
event-to-gap mappings without requiring the caller to pre-link them.

## Produces

Validated proposition-linked catalysts with status, timing, source refs, and an
optional event-to-expectation-to-thesis resolution mechanism.

## Methodology

The `ReasoningExecutor` proposes event mappings once, with one bounded repair
when needed. Validate event identity, preserve scheduled/conditional/occurred/cancelled/
unknown status, require proposition linkage, and retain uncertainty when dates
are not supported. A catalyst may confirm, challenge, or resolve uncertainty;
it does not imply stock direction.

## Evidence Requirements

Dates and windows require attributable source refs. Occurred events require
timing evidence. Future scheduled events are valid only when their timing is
supported; unsupported future dates are rejected.

## Deterministic / Model Boundary

Reasoning owns candidate event-to-thesis mapping over supplied evidence. Code
owns reference validation, status/timing validation, and bounded normalization.
The Skill does not call valuation, consensus, thesis, or event Skills.

## Missing Data

Unknown dates remain unknown. Missing timing evidence does not become an
estimated date; missing proposition linkage makes the candidate invalid.

## Validation / QC

Reject duplicate IDs, nonexistent proposition or gap refs, reversed windows,
invalid dates, unsupported timed catalysts, and occurred catalysts without
timing evidence.

## Related Skills

`thesis_formalize`, `expectation_gap`, and `thesis_refresh` are peer Skills
composed by a Workflow.
