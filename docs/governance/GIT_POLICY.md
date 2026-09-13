# Git Policy

This policy is active through the `docs/governance` manifest only.

- Bind work to a verified repository root, branch, commit, and remote baseline.
- Never force-push or rewrite shared history through automation.
- Commit only approved changed paths after required validation passes.
- Treat remote uncertainty and baseline drift as blocking conditions.
- The orchestrator consumes only valid template-shaped Writing Blocks. Sol must keep their field order and must not duplicate fields or protocol markers.
- The orchestrator does not infer user intent from ordinary prose. If work cannot be represented by an accepted protocol block, Sol must emit exactly one USER_MESSAGE block.
