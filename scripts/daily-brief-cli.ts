import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { DailyIntelligenceService } from '../app/services/daily-intelligence-service.ts'
import { WorkflowService } from '../app/services/workflow-service.ts'
import { OfficialDisclosureResearchPlugin, CninfoOfficialDisclosureClient } from '../plugins/research-acquisition/official.ts'
import { GdeltResearchPlugin } from '../plugins/research-acquisition/gdelt.ts'
import { RssResearchPlugin } from '../plugins/research-acquisition/rss.ts'

const type = process.argv[2] === 'evening' ? 'evening' : process.argv[2] === 'morning' ? 'morning' : undefined
if (!type) throw new Error('usage: npm run brief:morning | npm run brief:evening')
const root = resolve(process.cwd()); const service = new DailyIntelligenceService({ cwd: root, workflowService: new WorkflowService(), providers: [new OfficialDisclosureResearchPlugin(new CninfoOfficialDisclosureClient()), new GdeltResearchPlugin(), new RssResearchPlugin({ feedUrls: ['https://www.gov.cn/rss/zhengce.xml'] })] }); const date = new Date().toISOString().slice(0, 10); const started = service.startBrief({ workflowRunId: `brief-${type}-${date}-${randomUUID().slice(0, 8)}`, briefType: type, tradeDate: date }); console.log(JSON.stringify(await started.completion, null, 2))
