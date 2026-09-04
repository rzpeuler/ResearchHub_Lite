import { writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const outputFlag = process.argv.indexOf('-o')
const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined
if (process.argv.includes('--fail')) {
  process.stderr.write('fixture failure\n')
  process.exit(7)
}
if (process.argv.includes('--sleep')) await new Promise((resolve) => setTimeout(resolve, 500))
if (process.argv.includes('--spawn-grandchild')) {
  const pidFileFlag = process.argv.indexOf('--pid-file')
  const pidFile = pidFileFlag >= 0 ? process.argv[pidFileFlag + 1] : undefined
  const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  if (pidFile) writeFileSync(pidFile, String(grandchild.pid))
  await new Promise(() => {})
}
if (!outputPath) process.exit(8)
if (process.argv.includes('--big')) writeFileSync(outputPath, 'x'.repeat(1_000))
else writeFileSync(outputPath, JSON.stringify({ cwd: process.cwd(), ok: true }))
