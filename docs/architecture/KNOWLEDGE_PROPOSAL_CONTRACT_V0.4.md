# Knowledge Proposal Contract v0.4

Producer output is a local `SemanticProductionProposal`. It may request Entity, Relation, Claim, Source, Event, Observation, Thesis, or ReasoningEdge production, but it never supplies a durable canonical ID or directly writes storage.

The required boundary is:

```text
Skill / Workflow proposal
  -> Gateway identity and evidence binding
  -> Schema 0.4 validation and resolution intents
  -> validated ChangeSet
  -> atomic Writer
  -> canonical reload and query
```

Event proposals require an EventType, title/statement, Entity subject, and usable evidence. Observation proposals require an ObservationType and registered MetricRef. Metric observations require a value and Source; Estimate observations require institution, fiscal period, publication time, and Source; Consensus observations require numeric contributing Estimate proposals and an `asOf` time. Thesis proposals require an Entity subject, title, statement, and ThesisStatus. ReasoningEdge proposals name a typed source and target proposal and are admitted only for Observation/Claim -> Claim/Thesis endpoints.

`claimType: thesis` is retained only as a readable legacy compatibility value;
new v0.4 Gateway and ChangeSet writes reject it in favor of a first-class
Thesis proposal. Core Entity proposals may carry typed `externalIdentifiers`;
legacy `externalIds` remains readable and Company identity resolution remains
ticker plus exchange.

Source bindings are normalized acquisition results. Raw bytes are archived before the canonical ChangeSet is validated. A source with `derivativeKnowledgeAllowed: false` fails closed before any canonical Entity, Source, or derived object is written. All derived objects retain Source refs and Raw-backed provenance where their kind requires evidence.

`resolution: review` does not guess. The Gateway writes a durable ReviewCase with `schemaVersionAtCreation: 0.4`; existing v0.3 ReviewCases remain readable. `resolution: update`, `supersede`, and `contradict` preserve the existing Claim frozen-field and deterministic identity rules.

`KnowledgeProductionOutcome` returns kind-specific refs (`eventRefsByProposalId`, `observationRefsByProposalId`, `thesisRefsByProposalId`, and `reasoningEdgeRefsByProposalId`) alongside legacy Entity/Relation/Claim/Source maps. These maps are execution bindings, not canonical identity authorities.
