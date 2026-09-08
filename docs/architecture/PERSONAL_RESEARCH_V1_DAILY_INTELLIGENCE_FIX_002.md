# Personal Research v1 Daily Intelligence FIX-002

FIX-002 is implemented pending CTO acceptance. The Daily Intelligence Workflow now invokes asynchronous `daily_signal_enrichment`, bounded `daily_change_assessment`, and `daily_brief_synthesis` through the existing `ReasoningExecutor` seam. Deterministic validation preserves signal identity, limits model references to supplied local IDs, admits report items only to eligible sections, and rejects unsupported proposals before the existing Knowledge Production Gateway.

Durable proposals are grouped by watchlist subject and submitted separately with producer run identity `<workflowRunId>-<subjectKey>`. Evidence bindings are selected only from the current run's normalized sources and their original raw bytes. Reports expose only canonical subject references returned by Gateway; non-canonical signal references remain signal/evidence links.

Runtime, CLI, Scheduler, and Pi use the narrow `createDailyIntelligenceComposition` factory. It shares the active catalog provider set, watchlist paths, AKShare-backed calendar/cache/manual overrides, and Pi ModelRuntime executor. Runtime performs an immediate due check and then checks every 60 seconds; closing clears the timer. M3 is not started.
