# ResearchHub Homepage Shell v0.1

## Decision

Build a focused, same-origin React client over the completed ResearchHub Runtime. The shell has a persistent Top Bar with three product destinations: Research, Knowledge Graph, and Reviews. Research uses three persistent desktop regions: a conversation rail on the left, the active conversation in the center, and a compact research-context rail on the right. Knowledge Graph is a placeholder-only page in this phase; Reviews is a separate read-only page.

## Architecture

- Vite builds `client/` to `dist/client/`; the Runtime serves that directory and performs traversal-safe SPA fallback.
- A typed, fetch-based `RuntimeClient` owns API calls and keeps the bootstrap runtime token in memory only.
- A small history/popstate router maps `/` and `/research` to Research, `/graph` to the Knowledge Graph placeholder, and `/reviews` to the Review Inbox without adding a routing dependency.
- One `EventSource('/api/events')` normalizes live Runtime events into the application state. Persisted messages and session endpoints remain authoritative after reconnect, `session.changed`, and conversation switches.
- React hooks and a small reducer manage bootstrap, active conversation, transient stream state, selected context panel, attachments, workflow polling, and safe error projection. No global state library or heavyweight router is needed.

## Interaction

- Idle composer sends `prompt`; streaming composer explicitly exposes `steer`, `follow_up`, and `abort`.
- Conversation history supports new and switch operations and clears stale transient stream state before re-syncing.
- Research context is limited to Attachments, active Workflow, and Review notifications. Knowledge browsing is not placed in the Research page.
- The `/graph` destination displays only a bounded placeholder and mounted-Knowledge status; it has no graph API, canvas, node/edge model, or graph dependency.
- The `/reviews` destination contains the bounded ReviewCase list/detail projection and is read-only with no decision controls.
- Attachment upload renders only public metadata. `Add to Knowledge` is a separate explicit action that starts production and exposes the resulting Workflow run.
- Workflow polling runs while non-terminal and stops on terminal status; `completed_with_review` links to Review without resolving anything.

## Security and presentation

- The client is only reachable through Runtime same-origin serving; no CORS or remote access is added.
- Tokens, workspace paths, Knowledge paths, raw tool payloads, hidden reasoning, and unsanitized HTML never reach the DOM.
- Plain text rendering with visible focus, labels, disabled states, and Enter/Shift+Enter composer behavior is sufficient for v0.1.

## Verification

Add deterministic client tests for bootstrap, conversations, SSE resync, Review routing, graph placeholder routing, attachments, production, Workflow, and no-Knowledge-Base behavior. Add Runtime static-serving tests for all product routes and one faux-Pi local integration smoke test, then run the existing root suite unchanged.
