# Knowledge Schema v0.4 Mission State

Status: IMPLEMENTED_AND_VERIFIED.

Schema 0.4 is implemented as the first-class canonical contract while Schema 0.3 remains a compatibility input. The implementation adds Event, typed Metric/Estimate/Consensus Observation, Thesis, ReasoningEdge, Person, Institution, Security, structured ExternalIdentifier, Metric registry, Source rights, temporal fields, v0.3-to-v0.4 isolated migration, v0.4 query/read, application-service exposure, and v0.4 ReviewCase versioning.

Evidence command:

```text
npm run acceptance:knowledge-v04
```

Evidence artifact: `docs/project-state/evidence/2026-09-18-knowledge-v04.json`.

The prior artifact records K1–K10 as true for the lower-level contract path. Final closure additionally proves F1–F7 through the real `runEarningsReview()` workflow and intentionally excludes raw bodies, credentials, private paths, and reasoning traces.

Final closure evidence:

```text
npm run acceptance:knowledge-v04-final
```

Evidence artifact: `docs/project-state/evidence/2026-09-18-knowledge-v04-final-closure.json`.

The final run completed with `firstRevision: 2` and `replayRevision: 2`; all
F1–F7 assertions are true, including deterministic metric observations,
first-class Thesis persistence, valid ReasoningEdge endpoints, typed external
identifier reload, raw/source provenance, and replay-stable canonical counts.

The acceptance vertical is offline and fixture-backed. It proves runtime semantics and persistence boundaries; it is not a claim of authenticated external-provider E2E success. Existing v0.3 and v0.4 regression suites remain required before release.
