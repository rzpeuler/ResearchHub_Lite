import type { CompetitiveEvent, CompetitiveMarketMapInput, CompetitiveMarketMapResult, CompetitivePlayer, PeerAssessment, WhitespaceConclusion } from './contracts.ts'

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)
const text = (value: string | undefined): boolean => typeof value === 'string' && value.trim() !== ''
const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => text(value)))]
const date = (value: string | undefined): boolean => text(value) && !Number.isNaN(Date.parse(value!))
const periodValid = (value: string | undefined, asOf: string): boolean => text(value) && (!date(value) || Date.parse(value!) <= Date.parse(asOf))
const validStatus = (value: string): boolean => ['active', 'inactive', 'acquired', 'shutdown', 'pivoted', 'unknown'].includes(value)

function eventDiagnostics(event: CompetitiveEvent, asOf: string): string[] {
  return !text(event.id) || !text(event.description) || !periodValid(event.period, asOf) || event.sourceRefs.length === 0
    ? [`event ${event.id} is missing description, valid period, or source evidence`]
    : []
}

function playerDiagnostics(player: CompetitivePlayer, asOf: string): string[] {
  const diagnostics: string[] = []
  if (!text(player.id) || !text(player.name) || !validStatus(player.status) || !text(player.geography) || player.sourceRefs.length === 0) diagnostics.push(`player ${player.id} is missing identity, status, geography, or source evidence`)
  if (player.positioning.segments.length === 0 || !text(player.positioning.valueProposition) || player.positioning.sourceRefs.length === 0) diagnostics.push(`player ${player.id} lacks sourced positioning evidence`)
  if (player.peerEvidence !== undefined && player.peerEvidence.sourceRefs.length === 0) diagnostics.push(`player ${player.id} peer evidence requires source references`)
  if (player.scaleProxy !== undefined && (!text(player.scaleProxy.metric) || !text(player.scaleProxy.unit) || !periodValid(player.scaleProxy.period, asOf) || (player.scaleProxy.value !== undefined && !finite(player.scaleProxy.value)) || player.scaleProxy.sourceRefs.length === 0)) diagnostics.push(`player ${player.id} scale proxy is invalid or unsourced`)
  for (const event of player.events) diagnostics.push(...eventDiagnostics(event, asOf))
  return diagnostics
}

function peerAssessment(player: CompetitivePlayer): PeerAssessment {
  const evidence = player.peerEvidence
  if (evidence === undefined) return { playerId: player.id, isAttributablePeer: false, reasons: ['no explicit purchase-decision, workflow, economics, and customer-overlap evidence'], sourceRefs: [] }
  const reasons = [
    evidence.samePurchaseDecision ? undefined : 'purchase decision is not shown to match',
    evidence.sameWorkflow ? undefined : 'workflow is not shown to match',
    evidence.sameEconomics ? undefined : 'economics are not shown to match',
    evidence.customerOverlap ? undefined : 'customer overlap is not shown',
  ].filter((item): item is string => item !== undefined)
  return { playerId: player.id, isAttributablePeer: reasons.length === 0 && evidence.sourceRefs.length > 0, reasons: reasons.length === 0 ? ['all four comparability dimensions are explicit'] : reasons, sourceRefs: unique(evidence.sourceRefs) }
}

function whitespaceResult(input: CompetitiveMarketMapInput): CompetitiveMarketMapResult['whitespace'] {
  if (input.whitespace === undefined) return undefined
  const conclusion: WhitespaceConclusion = input.whitespace.unmetNeed !== 'present' ? 'inconclusive' : input.whitespace.economicSignal === 'attractive' ? 'supported_whitespace' : input.whitespace.economicSignal === 'unattractive' ? 'economically_unattractive' : 'inconclusive'
  return { ...input.whitespace, conclusion }
}

export function analyzeCompetitiveMarketMap(input: CompetitiveMarketMapInput): CompetitiveMarketMapResult {
  const diagnostics: string[] = []
  if (!text(input.marketRef) || !date(input.asOf)) diagnostics.push('marketRef and ISO-compatible asOf are required')
  if (!text(input.boundary.marketName) || input.boundary.included.length === 0 || input.boundary.excluded.length === 0 || !text(input.boundary.geography) || !periodValid(input.boundary.period, input.asOf) || input.boundary.sourceRefs.length === 0) diagnostics.push('competitive boundary requires included/excluded scope, geography, period, and sources')
  if (!text(input.segmentation.axis) || input.segmentation.values.length === 0 || input.segmentation.sourceRefs.length === 0) diagnostics.push('competitive segmentation requires one sourced axis with values')
  const ids = new Set<string>()
  for (const player of input.players) { if (ids.has(player.id)) diagnostics.push(`duplicate player ${player.id}`); ids.add(player.id); diagnostics.push(...playerDiagnostics(player, input.asOf)) }
  if (input.whitespace !== undefined && (!text(input.whitespace.explanation) || input.whitespace.sourceRefs.length === 0)) diagnostics.push('whitespace assessment requires an explanation and sources')
  const validPlayers = input.players.filter((player) => playerDiagnostics(player, input.asOf).length === 0)
  const peerAssessments = validPlayers.map(peerAssessment)
  const events = validPlayers.flatMap((player) => player.events.filter((event) => eventDiagnostics(event, input.asOf).length === 0).map((event) => ({ ...event, playerId: player.id })))
  const whitespace = whitespaceResult(input)
  const coreValid = diagnostics.every((item) => !item.includes('competitive boundary') && !item.includes('competitive segmentation'))
  const status: CompetitiveMarketMapResult['status'] = !coreValid ? 'unavailable' : diagnostics.length === 0 && validPlayers.length === input.players.length ? 'complete' : validPlayers.length > 0 ? 'partial' : 'unavailable'
  return { status, marketRef: input.marketRef, boundary: input.boundary, segmentation: input.segmentation, players: input.players, peerAssessments, events, whitespace, diagnostics: unique(diagnostics), asOf: input.asOf }
}
