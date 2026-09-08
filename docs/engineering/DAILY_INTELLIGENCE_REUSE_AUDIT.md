# Daily Intelligence v1 Reuse Audit

Date: 2026-09-08

This audit is the required gate before adding Daily Intelligence acquisition code. The decision is to adapt narrow existing seams and keep provider-specific logic concrete; no generic crawler or Provider Registry is introduced.

| Asset | Decision | Use | Boundary / reason |
|---|---|---|---|
| Lite `plugins/research-acquisition/contracts.ts` | DEPEND | Existing candidate, fetched, normalized source, diagnostic, and provider-outcome vocabulary | Extend only with Daily Signal v2 fields; preserve Company Research compatibility |
| Lite `plugins/research-acquisition/official.ts` | ADAPT | CNINFO discovery/fetch and official announcement normalization | Add investor-relations classification metadata; keep CNINFO client narrow |
| Lite `plugins/research-acquisition/akshare.ts` | DEPEND | Structured market/company data through the injected runner | Add Daily-specific endpoint adapters only where a stable response exists; empty/failed remains explicit |
| Lite `plugins/research-acquisition/gdelt.ts` | ADAPT | Public news discovery and fetch | Bound query/entity scope and convert failures to provider diagnostics |
| Lite `plugins/research-acquisition/rss.ts` | DEPEND | RSS parsing and article normalization | Reuse parser; catalog controls feed scope |
| Lite `plugins/document/input-resolver.ts` | DEPEND | HTML/PDF/text byte-preserving normalization seam | Do not create a second document/PDF extractor |
| Lite `knowledge/raw/raw-archive.ts` | REFERENCE | Raw retention/integrity when a durable proposal needs evidence | Daily signals remain non-canonical and do not write Raw solely for ranking |
| Lite `plugins/research-acquisition/signal-store.ts` | ADAPT | Append-only local signal persistence pattern | Add bounded time-window and dedup-aware Daily store without a database |
| Lite `app/services/research-report.ts` | DEPEND | Validated report metadata and persisted report artifacts | Add Daily Brief report type/sections through the same report boundary |
| Lite `knowledge/production/gateway.ts` | DEPEND | Only canonical mutation seam | Daily workflow never allocates canonical IDs or writes directly |
| Original `packages/plugins/news/acquisition` | REFERENCE | Official announcement, news search, article normalization shape | Do not copy its old orchestration/harness or revive legacy architecture |
| Original `packages/plugins/news/acquisition/official-announcement-*` | ADAPT | Candidate filtering and official announcement semantics | Re-express under Lite plugin contracts |
| Original `packages/plugins/market` | REFERENCE | Market composition and provider separation ideas | No old harness or runtime dependency |
| Original `packages/plugins/financial` | REFERENCE | Financial source naming and structured data hints | Existing Lite AKShare seam remains authoritative |
| AKShare project | DEPEND | Existing local Python bridge for free structured data | No new service; failures are usable/empty/failed outcomes |
| RSSHub | REFERENCE | Public feed URL conventions | No RSSHub server dependency or crawler framework |
| Trafilatura | REFERENCE | HTML extraction behavior if available in the environment | Prefer existing resolver/native fetch; no unconditional dependency |
| Crawl4AI / Playwright | EXCLUDE | JS rendering only | Optional injected seam may be added later if static content is insufficient; no default browser automation |
| `zcker/xueqiu-crawler` | REFERENCE | Bounded Xueqiu source/account experiment | No clone, login, cookie, anti-bot, or full-market crawl |
| `nkzhengwt/Eastmoney_Guba_Nlp_Daily` | REFERENCE | Eastmoney Guba bounded signal fields | No clone and no claim that community text is fact evidence |
| Node timers / Windows Task Scheduler | DEPEND | Local scheduler and current-user task scripts | No Redis, queue, distributed worker, or scheduler framework |

## Catalog verification

The initial catalog uses stable public evidence pages for CNINFO, SSE, SZSE, Chinese regulators and ministries, public company IR pages, public market/news sites, GDELT, AKShare documentation, Xueqiu, and Eastmoney Guba. URLs were probed from the Windows environment on 2026-09-08; a response may be 403/521 or TLS-blocked while still being retained only when the public domain and evidence page are known. Entries with unverifiable identity are excluded rather than invented. The catalog is configuration, not canonical Knowledge.

