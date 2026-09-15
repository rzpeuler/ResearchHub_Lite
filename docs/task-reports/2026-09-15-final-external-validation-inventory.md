# Final External Validation Inventory

Date: 2026-09-15

This inventory records the remaining external or user-dependent validation
items for the V1 mission. No item is silently omitted.

| Item | Status | Evidence / boundary |
| --- | --- | --- |
| Pi/Codex reasoning host | COMPLETED_ON_CONFIGURED_HOST | Fresh real-Pi Company, Earnings, Valuation, Event, Thesis, and Daily runs completed. No credentials, cookies, prompts, or raw model output were persisted. |
| Managed Docling runtime and MIIT PDF smoke | COMPLETED | Parser preflight is `READY`; the controlled MIIT fetch/normalization smoke passed. |
| Free public Industry provider coverage | DEFERRED_BY_USER_FOR_NOW | Fresh TEST-054 reached two waves, eight modules, Gateway/Writer, canonical reload, and report persistence, but only the available qualified evidence was admitted; seven modules lacked qualified live evidence because providers were empty, rate-limited, or degraded. The user explicitly authorized temporary deferral when no further stable source can be supplied. |
| Free public Daily provider coverage | BLOCKED_EXTERNAL | Provider outcomes are recorded as empty, HTTP 429, or bounded bridge failure. The Daily engine remains explicit about unavailable material. |
| User login, OAuth, CAPTCHA/MFA, paid APIs, broker accounts | DEFERRED_OUT_OF_SCOPE | V1 adapters and validation do not require these credentials; login automation, CAPTCHA bypass, paid services, and trading execution remain outside the product scope. |
| ReviewDecision write actions | DESIGN_ONLY_DEFERRED | This is a product/governance decision rather than an external credential check. The current UI and APIs remain read-only until an explicit product decision authorizes mutation. |

The Industry external-provider row is explicitly deferred by the user for now;
it is not a real-data completion claim. Fixtures may continue to support
deterministic local tests, but placeholder data must not enter production
research output, canonical Knowledge, or live-evidence acceptance.
