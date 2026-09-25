import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export interface ResearchReportSection { readonly id: string; readonly title: string; readonly markdown: string; readonly sourceRefs?: readonly string[]; readonly claimRefs?: readonly string[]; readonly relationRefs?: readonly string[]; readonly signalRefs?: readonly string[]; readonly evidenceLinks?: readonly string[] }
export interface ResearchReport {
  readonly reportId: string
  readonly reportType: 'company_research' | 'daily_brief' | 'earnings_review' | 'valuation' | 'event_research' | 'thesis_red_team' | 'industry_research' | 'thesis_lifecycle'
  readonly subjectRefs: readonly string[]
  readonly generatedAt: string
  readonly asOf: string
  readonly workflowRunId: string
  readonly knowledgeBaseRevision: number
  readonly sourceRefs: readonly string[]
  readonly claimRefs: readonly string[]
  readonly methodology: string
  readonly sections: readonly ResearchReportSection[]
  readonly outputPath: string
}
export interface ResearchReportSummary {
  readonly reportId: string
  readonly reportType: ResearchReport['reportType']
  readonly subjectRefs: readonly string[]
  readonly generatedAt: string
  readonly asOf: string
  readonly workflowRunId: string
  readonly knowledgeBaseRevision: number
  readonly sourceCount: number
  readonly claimCount: number
  readonly sectionCount: number
  readonly methodology: string
}

const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const inside = (root: string, candidate: string): boolean => { const rel = relative(resolve(root), resolve(candidate)); return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`)) }
const ref = (value: string): boolean => /^(?:entity|relation|claim|source|theme-group|module):[^\s]+$/.test(value)
const thesisRef = (value: string): boolean => /^thesis:[^\s]+$/.test(value)

export function validateResearchReport(report: ResearchReport): ResearchReport {
  if (!report || typeof report !== 'object') throw new TypeError('ResearchReport must be an object')
  if (!safeId.test(report.reportId)) throw new TypeError('reportId must be a safe deterministic identifier')
  if (report.reportType !== 'company_research' && report.reportType !== 'daily_brief' && report.reportType !== 'earnings_review' && report.reportType !== 'valuation' && report.reportType !== 'event_research' && report.reportType !== 'thesis_red_team' && report.reportType !== 'industry_research' && report.reportType !== 'thesis_lifecycle') throw new TypeError('Unsupported reportType')
  if (!Array.isArray(report.subjectRefs) || (report.reportType !== 'daily_brief' && report.subjectRefs.length === 0) || report.subjectRefs.some((item) => thesisRef(item) ? report.reportType !== 'thesis_lifecycle' : !ref(item))) throw new TypeError('subjectRefs must contain canonical references valid for the report type')
  if (Number.isNaN(Date.parse(report.generatedAt)) || Number.isNaN(Date.parse(report.asOf))) throw new TypeError('generatedAt and asOf must be valid dates')
  if (!safeId.test(report.workflowRunId) || !Number.isInteger(report.knowledgeBaseRevision) || report.knowledgeBaseRevision < 0) throw new TypeError('Invalid workflow/revision metadata')
  if (!report.sourceRefs || report.sourceRefs.some((item: string) => !/^source:[^\s]+$/.test(item))) throw new TypeError('sourceRefs must contain Source references')
  if (!report.claimRefs || report.claimRefs.some((item: string) => !/^claim:[^\s]+$/.test(item))) throw new TypeError('claimRefs must contain Claim references')
  if (typeof report.methodology !== 'string' || report.methodology.trim() === '') throw new TypeError('methodology is required')
  if (!report.sections || report.sections.length === 0 || report.sections.some((section: ResearchReportSection) => !safeId.test(section.id) || section.title.trim() === '' || section.markdown.trim() === '')) throw new TypeError('sections must contain non-empty Markdown sections')
  if (report.sections.some((section: ResearchReportSection) => (section.sourceRefs ?? []).some((item: string) => !/^source:[^\s]+$/.test(item)) || (section.claimRefs ?? []).some((item: string) => !/^claim:[^\s]+$/.test(item)))) throw new TypeError('section references must be canonical Source/Claim references')
  if (report.sections.some((section: ResearchReportSection) => (section.relationRefs ?? []).some((item: string) => !/^relation:[^\s]+$/.test(item)))) throw new TypeError('section relationRefs must be canonical Relation references')
  if (report.sections.some((section: ResearchReportSection) => (section.signalRefs ?? []).some((item: string) => !safeId.test(item)))) throw new TypeError('signalRefs must contain safe ResearchSignal references')
  if (typeof report.outputPath !== 'string' || report.outputPath.trim() === '' || isAbsolute(report.outputPath) || report.outputPath.split(/[\\/]+/).includes('..')) throw new TypeError('outputPath must be a safe relative file path')
  return report
}

export function summarizeResearchReport(report: ResearchReport): ResearchReportSummary {
  validateResearchReport(report)
  return {
    reportId: report.reportId,
    reportType: report.reportType,
    subjectRefs: report.subjectRefs,
    generatedAt: report.generatedAt,
    asOf: report.asOf,
    workflowRunId: report.workflowRunId,
    knowledgeBaseRevision: report.knowledgeBaseRevision,
    sourceCount: report.sourceRefs.length,
    claimCount: report.claimRefs.length,
    sectionCount: report.sections.length,
    methodology: report.methodology,
  }
}

export function renderResearchReport(report: ResearchReport): string {
  const title = report.reportType === 'daily_brief' ? 'Daily Intelligence Brief' : report.reportType === 'earnings_review' ? 'Earnings Review' : report.reportType === 'valuation' ? 'Valuation' : report.reportType === 'event_research' ? 'Event Research' : report.reportType === 'thesis_red_team' ? 'Thesis Red Team' : report.reportType === 'industry_research' ? 'Industry Research' : report.reportType === 'thesis_lifecycle' ? 'Thesis Lifecycle' : 'Company Research'
  const lines = [`# ${title}`, '', `- Report: ${report.reportId}`, `- As of: ${report.asOf}`, `- Knowledge revision: ${report.knowledgeBaseRevision}`, '', `Methodology: ${report.methodology}`, '']
  for (const section of report.sections) { lines.push(`## ${section.title}`, '', section.markdown.trim(), ''); if (section.sourceRefs?.length) lines.push(`Sources: ${section.sourceRefs.join(', ')}`, ''); if (section.relationRefs?.length) lines.push(`Relations: ${section.relationRefs.join(', ')}`, ''); if (section.claimRefs?.length) lines.push(`Claims: ${section.claimRefs.join(', ')}`, '') }
  return `${lines.join('\n').trim()}\n`
}

export async function writeResearchReport(report: ResearchReport, reportRoot: string): Promise<string> {
  validateResearchReport(report)
  const outputPath = resolve(reportRoot, report.outputPath)
  if (!inside(resolve(reportRoot), outputPath)) throw new TypeError('Report outputPath escapes reportRoot')
  await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, renderResearchReport(report), 'utf8'); await writeFile(`${outputPath}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); return outputPath
}

export async function readResearchReport(path: string): Promise<ResearchReport> { const value = JSON.parse(await readFile(path, 'utf8')) as ResearchReport; return validateResearchReport(value) }
