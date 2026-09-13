import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { resolveCodexCliExecutable, buildCodexCliProcessInvocation } from '../../plugins/reasoning/codex-cli/executor.ts'

const exec = promisify(execFile)
const evidencePath = 'tests/validation/evidence/RHL_M3B_CODEX_CLI_WINDOWS_RESOLUTION.json'

const evidence = {
  taskId: 'RHL-M3B-3B-FIX-028-CODEX-CLI-WINDOWS-STANDALONE-RESOLUTION', baseline: '7350cfa06cb47e8a67cad78903b25368479fb125', platform: process.platform,
  resolutionSource: 'none' as string, executableKind: 'none' as string, discovered: false, versionAvailable: false, safeExecHelpAvailable: false, classification: 'CLI_NOT_INSTALLED_IN_SUPPORTED_LAYOUT' as string,
  privacy: { absolutePathStored: false, usernameStored: false, appDataStored: false, userProfileStored: false, pathContentsStored: false, environmentDumpStored: false, credentialsStored: false },
}

try {
  const resolution = resolveCodexCliExecutable()
  evidence.resolutionSource = resolution.source; evidence.executableKind = resolution.kind; evidence.discovered = true
  evidence.classification = 'CLI_PRESENT_BUT_NOT_EXECUTABLE'
  const version = buildCodexCliProcessInvocation(resolution.executable, ['--version'])
  const help = buildCodexCliProcessInvocation(resolution.executable, ['exec', '--help'])
  await exec(version.executable, version.args, { windowsHide: true, timeout: 15_000, maxBuffer: 16_000 })
  evidence.versionAvailable = true
  await exec(help.executable, help.args, { windowsHide: true, timeout: 15_000, maxBuffer: 32_000 })
  evidence.safeExecHelpAvailable = true
  evidence.classification = 'LOCALLY_USABLE'
} catch {
  // The local smoke is deliberately non-semantic; sanitized evidence is still written below.
} finally {
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
}

if (!evidence.discovered || !evidence.versionAvailable || !evidence.safeExecHelpAvailable) process.exitCode = 1
