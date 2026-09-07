import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ownedTestRoots = ['tests/app', 'tests/knowledge', 'tests/plugins', 'tests/skills', 'tests/workflows', 'tests/validation']

async function discoverTests(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolutePath = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await discoverTests(absolutePath))
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(absolutePath)
    }
  }
  return files
}

const discovered = []
for (const root of ownedTestRoots) {
  discovered.push(...await discoverTests(resolve(repoRoot, root)))
}

const files = discovered
  .map((file) => relative(repoRoot, file))
  .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)

process.stdout.write(`Discovered ${files.length} Node test files.\n`)

const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: false,
})

child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.exitCode = 1
  } else {
    process.exitCode = code ?? 1
  }
})
