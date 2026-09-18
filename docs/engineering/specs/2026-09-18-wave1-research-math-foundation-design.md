# Wave 1 Research Math Foundation Design

Date: 2026-09-18
Task: `RHL-W1-001-RESEARCH-MATH-FOUNDATION`
Status: approved execution baseline

## Purpose

Wave 1 establishes integrity boundaries and schema-neutral contracts for
future deterministic valuation and Earnings financial-quality calculations. It
does not implement finance formulas or expose new product capabilities.

## Boundaries

- No new architecture layer is introduced. Code remains physically owned by
  the existing Valuation and Earnings Review Skills.
- Atomic calculation contracts are Knowledge-schema-neutral and do not import
  Knowledge, Workflow, or Application types.
- No per-atomic-capability Knowledge mapping, canonical persistence, or metric
  registry change is introduced.
- Company Research no longer produces a relative valuation from synthetic peer
  multiples. The existing `relativeValuation()` utility remains available for
  callers that supply attributable peer inputs.
- W1-001 contains contracts and methodology guardrails only. Formula
  implementation belongs to W1-002; financial-quality calculation
  implementation belongs to W1-003.
- DCF remains deferred and unavailable in the current Valuation v0.1 product
  path.
- No Knowledge Schema, Workflow topology, provider, route, public valuation
  method, or top-level Research Skill change is authorized.

## Verification

Focused Company Research tests characterize the fail-closed valuation behavior
and preserve the direct deterministic utility. Static dependency and layout
checks ensure the new contract directories remain isolated. Existing workflow
and full repository validation remain required before Sol acceptance.
