import { writeFileSync } from 'node:fs'

const outputFlag = process.argv.indexOf('-o')
const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined
if (process.argv.includes('--fail')) {
  process.stderr.write('fixture failure\n')
  process.exit(7)
}
if (process.argv.includes('--sleep')) await new Promise((resolve) => setTimeout(resolve, 500))
if (!outputPath) process.exit(8)
if (process.argv.includes('--big')) writeFileSync(outputPath, 'x'.repeat(1_000))
else writeFileSync(outputPath, JSON.stringify({ cwd: process.cwd(), ok: true }))
