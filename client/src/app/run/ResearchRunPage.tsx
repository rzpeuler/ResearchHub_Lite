import { useState } from 'react'
import type { ReactElement, FormEvent } from 'react'
import { RuntimeClient, RuntimeClientError, type ResearchStartResponse } from '../../api/runtime-client'

type Operation = 'company' | 'industry' | 'earnings' | 'valuation' | 'event' | 'thesis'
const operationLabels: Record<Operation, string> = { company: 'Company', industry: 'Industry', earnings: 'Earnings', valuation: 'Valuation', event: 'Event', thesis: 'Thesis' }
const operationDescriptions: Record<Operation, string> = { company: 'Build an evidence-backed company profile and linked report.', industry: 'Run the bounded eight-module industry research workflow.', earnings: 'Review one fiscal period against the covered company.', valuation: 'Calculate bounded PE, PB, or EV/EBITDA scenarios.', event: 'Assess a company-bound event and its second-order impact.', thesis: 'Red-team an existing canonical Thesis Claim.' }
const periods = ['Q1', 'H1', 'Q3', 'FY'] as const
const valuationMethods = ['PE', 'PB', 'EV_EBITDA'] as const

interface ResearchRunPageProps { readonly client: RuntimeClient; readonly onLaunched: (result: ResearchStartResponse) => void }
function errorText(error: unknown): string { return error instanceof RuntimeClientError ? error.message : 'ResearchHub runtime operation failed' }
function optional(value: string): string | undefined { const trimmed = value.trim(); return trimmed || undefined }
function csv(value: string): readonly string[] | undefined { const items = value.split(',').map((item) => item.trim()).filter(Boolean); return items.length > 0 ? items : undefined }

export function ResearchRunPage({ client, onLaunched }: ResearchRunPageProps): ReactElement {
  const [operation, setOperation] = useState<Operation>('company')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [exchange, setExchange] = useState('')
  const [asOf, setAsOf] = useState('')
  const [industryName, setIndustryName] = useState('')
  const [aliases, setAliases] = useState('')
  const [searchTerms, setSearchTerms] = useState('')
  const [canonicalRef, setCanonicalRef] = useState('')
  const [maxSources, setMaxSources] = useState('')
  const [maxEvidencePerModule, setMaxEvidencePerModule] = useState('')
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()))
  const [period, setPeriod] = useState<(typeof periods)[number]>('FY')
  const [methods, setMethods] = useState<readonly (typeof valuationMethods)[number][]>(['PE', 'PB', 'EV_EBITDA'])
  const [targetFiscalYear, setTargetFiscalYear] = useState('')
  const [anchorKind, setAnchorKind] = useState<'daily_signal' | 'article' | 'url' | 'user_event'>('article')
  const [signalId, setSignalId] = useState('')
  const [eventUrl, setEventUrl] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [thesisRef, setThesisRef] = useState('')
  const [lookbackDays, setLookbackDays] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const input = (label: string, value: string, onChange: (value: string) => void, placeholder?: string, required = false): ReactElement => <label className="run-field"><span>{label}{required ? ' *' : ''}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>
  const sharedFields = <div className="run-grid">{input('A-share symbol', symbol, setSymbol, '600519', true)}{input('Exchange', exchange, setExchange, 'SSE')}{input('Company name', name, setName, 'Optional')}{input('As of', asOf, setAsOf, 'ISO timestamp, optional')}</div>

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); if (busy) return; setError('')
    if (operation !== 'industry' && !/^\d{6}$/.test(symbol.trim())) { setError('A-share symbol must be six digits.'); return }
    if (operation === 'industry' && !industryName.trim()) { setError('Industry name is required.'); return }
    if (operation === 'valuation' && methods.length === 0) { setError('Select at least one valuation method.'); return }
    if (operation === 'event' && anchorKind === 'daily_signal' && !signalId.trim()) { setError('Daily Signal ID is required.'); return }
    if (operation === 'event' && (anchorKind === 'article' || anchorKind === 'url') && !eventUrl.trim()) { setError('Event URL is required.'); return }
    if (operation === 'event' && anchorKind === 'user_event' && (!eventTitle.trim() || !eventDescription.trim())) { setError('User event title and description are required.'); return }
    if (operation === 'thesis' && !/^claim:\S+$/.test(thesisRef.trim())) { setError('Thesis reference must be a canonical claim: reference.'); return }
    setBusy(true)
    try {
      let result: ResearchStartResponse
      if (operation === 'company') result = await client.startResearchCompany({ symbol: symbol.trim(), ...(optional(name) === undefined ? {} : { name: optional(name) }), ...(optional(exchange) === undefined ? {} : { exchange: optional(exchange) }), ...(optional(asOf) === undefined ? {} : { asOf: optional(asOf) }) })
      else if (operation === 'industry') result = await client.startResearchIndustry({ name: industryName.trim(), ...(csv(aliases) === undefined ? {} : { aliases: csv(aliases) }), ...(csv(searchTerms) === undefined ? {} : { searchTerms: csv(searchTerms) }), ...(optional(canonicalRef) === undefined ? {} : { canonicalRef: optional(canonicalRef) }), ...(optional(asOf) === undefined ? {} : { asOf: optional(asOf) }), ...(Number(maxSources) > 0 ? { maxSources: Number(maxSources) } : {}), ...(Number(maxEvidencePerModule) > 0 ? { maxEvidencePerModule: Number(maxEvidencePerModule) } : {}) })
      else if (operation === 'earnings') result = await client.startEarningsReview({ symbol: symbol.trim(), fiscalYear: Number(fiscalYear), period, ...(optional(name) === undefined ? {} : { name: optional(name) }), ...(optional(exchange) === undefined ? {} : { exchange: optional(exchange) }), ...(optional(asOf) === undefined ? {} : { asOf: optional(asOf) }) })
      else if (operation === 'valuation') result = await client.startValuation({ symbol: symbol.trim(), methods, ...(targetFiscalYear.trim() ? { targetFiscalYear: Number(targetFiscalYear) } : {}), ...(optional(name) === undefined ? {} : { name: optional(name) }), ...(optional(exchange) === undefined ? {} : { exchange: optional(exchange) }), ...(optional(asOf) === undefined ? {} : { asOf: optional(asOf) }) })
      else if (operation === 'event') result = await client.startEventResearch({ symbol: symbol.trim(), anchor: anchorKind === 'daily_signal' ? { kind: anchorKind, signalId: signalId.trim() } : anchorKind === 'user_event' ? { kind: anchorKind, title: eventTitle.trim(), description: eventDescription.trim(), ...(optional(eventDate) === undefined ? {} : { eventDate: optional(eventDate) }) } : { kind: anchorKind, url: eventUrl.trim(), ...(optional(eventTitle) === undefined ? {} : { title: optional(eventTitle) }), ...(optional(eventDate) === undefined ? {} : { publishedAt: optional(eventDate) }) }, ...(optional(name) === undefined ? {} : { name: optional(name) }), ...(optional(exchange) === undefined ? {} : { exchange: optional(exchange) }), ...(optional(asOf) === undefined ? {} : { asOf: optional(asOf) }) })
      else result = await client.startThesisRedTeam({ symbol: symbol.trim(), thesisRef: thesisRef.trim(), ...(lookbackDays.trim() ? { lookbackDays: Number(lookbackDays) } : {}), ...(optional(name) === undefined ? {} : { name: optional(name) }), ...(optional(exchange) === undefined ? {} : { exchange: optional(exchange) }), ...(optional(asOf) === undefined ? {} : { asOf: optional(asOf) }) })
      onLaunched(result)
    } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) }
  }

  return <main className="page-frame run-page" aria-labelledby="run-title"><div className="page-heading"><div><span className="eyebrow">WORKFLOW CONTROL</span><h1 id="run-title">Run Research</h1></div><span className="read-only-badge">Governed launch</span></div><p>Start an existing research workflow with bounded inputs. Results are asynchronous and remain subject to provider availability and evidence quality.</p><div className="run-layout"><aside className="run-operations" aria-label="Research operations"><span className="eyebrow">OPERATION</span>{(Object.keys(operationLabels) as Operation[]).map((item) => <button className={operation === item ? 'run-operation selected' : 'run-operation'} key={item} onClick={() => { setOperation(item); setError('') }}><strong>{operationLabels[item]}</strong><small>{operationDescriptions[item]}</small></button>)}</aside><form className="run-form" onSubmit={(event) => void submit(event)}><div className="section-title"><div><span className="eyebrow">{operationLabels[operation]}</span><h2>{operationDescriptions[operation]}</h2></div></div>{operation === 'industry' ? <div className="run-grid">{input('Industry name', industryName, setIndustryName, 'PCB / AI Server Hardware', true)}{input('Canonical ref', canonicalRef, setCanonicalRef, 'entity:industry, optional')}{input('Aliases', aliases, setAliases, 'comma-separated')}{input('Search terms', searchTerms, setSearchTerms, 'comma-separated')}{input('Max sources', maxSources, setMaxSources, 'Optional, 1–50')}{input('Evidence per module', maxEvidencePerModule, setMaxEvidencePerModule, 'Optional, 1–12')}</div> : <>{sharedFields}{operation === 'earnings' ? <div className="run-grid">{input('Fiscal year', fiscalYear, setFiscalYear, '2026', true)}<label className="run-field"><span>Period *</span><select value={period} onChange={(event) => setPeriod(event.target.value as (typeof periods)[number])}>{periods.map((item) => <option key={item}>{item}</option>)}</select></label></div> : null}{operation === 'valuation' ? <div className="run-grid"><fieldset className="run-fieldset"><legend>Methods *</legend>{valuationMethods.map((item) => <label className="check-field" key={item}><input type="checkbox" checked={methods.includes(item)} onChange={(event) => setMethods((old) => event.target.checked ? [...old, item] : old.filter((value) => value !== item))} />{item}</label>)}</fieldset>{input('Target fiscal year', targetFiscalYear, setTargetFiscalYear, 'Optional')}</div> : null}{operation === 'event' ? <div className="run-fields-block"><label className="run-field"><span>Anchor kind *</span><select value={anchorKind} onChange={(event) => setAnchorKind(event.target.value as typeof anchorKind)}><option value="article">Article</option><option value="url">URL</option><option value="daily_signal">Daily Signal</option><option value="user_event">User event</option></select></label>{anchorKind === 'daily_signal' ? input('Signal ID', signalId, setSignalId, 'signal id', true) : anchorKind === 'user_event' ? <>{input('Event title', eventTitle, setEventTitle, 'Title', true)}{input('Event date', eventDate, setEventDate, 'Optional') }<label className="run-field"><span>Description *</span><textarea value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} rows={4} /></label></> : <>{input('Event URL', eventUrl, setEventUrl, 'https://…', true)}{input('Article title', eventTitle, setEventTitle, 'Optional')}{input('Published at', eventDate, setEventDate, 'Optional')}</>}</div> : null}{operation === 'thesis' ? <div className="run-grid">{input('Thesis Claim ref', thesisRef, setThesisRef, 'claim:...', true)}{input('Lookback days', lookbackDays, setLookbackDays, 'Optional, 30–1095')}</div> : null}</>}{error ? <div className="notice run-error" role="alert"><strong>Launch failed</strong><p>{error}</p></div> : null}<div className="run-submit"><span className="muted">The runtime creates the Workflow ID and tracks completion in Research.</span><button className="primary-action" type="submit" disabled={busy}>{busy ? 'Starting…' : `Start ${operationLabels[operation]}`}</button></div></form></div></main>
}
