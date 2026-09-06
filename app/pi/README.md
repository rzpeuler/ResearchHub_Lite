# ResearchHub Pi host

`createResearchHubPiSession()` is the programmatic application-host entrypoint. It creates one Pi `ModelRuntime` for the session and, when no executor is supplied, injects that same runtime into `PiReasoningExecutor`. By default it uses Pi's official global `getAgentDir()` for auth, models, and file-backed settings; `SettingsManager.create(cwd, agentDir, { projectTrusted: true })` loads global `<agentDir>/settings.json` together with trusted project-local `<cwd>/.pi/settings.json`. Callers may pass an explicit `agentDir` for tests or isolated deployments, or an explicit `settingsManager` when they own configuration. Tests may inject a deterministic `ReasoningExecutor`, model, or completion.

The session registers only ResearchHub application tools for Knowledge Production: `researchhub_status` is read-only and `researchhub_ingest_text` enters the existing Raw Document Knowledge Ingestion Workflow. A mounted Knowledge Base root is fixed for the session; callers cannot override it through tool parameters.

Pi coding tools and Pi Skills remain available for ordinary agent work. The Workflow semantic context is built independently by `PiReasoningExecutor` and does not include the Pi conversation, project `AGENTS.md`, or Pi Skill text.

Write/edit calls targeting a mounted canonical Knowledge Base are blocked at Pi's tool-call boundary. Explicit shell references are intercepted, but unrestricted child-shell path construction cannot be fully isolated by this layer; this is intentionally reported as `BASH_ISOLATION_GAP` until a restricted process/sandbox or Writer-mediated permission boundary is supplied.
