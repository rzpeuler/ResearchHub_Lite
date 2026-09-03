# Knowledge Curation Skill

This skill performs semantic understanding, extraction-candidate generation, and bounded semantic-case resolution. It is reasoning-host neutral and does not own workflow routing, retries, validation bypasses, canonical identity, persistence, or commits.

The three active operations are `understandAndPlan`, `extractKnowledge`, and `resolveSemanticCase`. The deterministic validator owns document-reference resolution, Schema 0.3 vocabulary checks, candidate dependency checks, confidence bounds, grounding, and strict semantic-case outcome validation.
