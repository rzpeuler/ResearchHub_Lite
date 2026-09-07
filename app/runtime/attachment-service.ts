import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { ApplicationServiceError } from '../services/contracts.ts'

export const DEFAULT_MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024
const MAX_MULTIPART_HEADER_BYTES = 64 * 1024
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024
const ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/
const RESERVED_ATTACHMENT_FILENAMES = new Set(['metadata.json', '.metadata.tmp', '.upload.tmp'])

export interface AttachmentRef {
  readonly attachmentId: string
  readonly filename: string
  readonly mediaType: string
  readonly size: number
  readonly sha256: string
  readonly createdAt: string
  readonly workspaceRelativePath: string
}

export interface AttachmentServiceOptions {
  readonly workspaceRoot: string
  readonly maxBytes?: number
}

interface StoredMetadata extends AttachmentRef { readonly version: 1 }
interface ActivePart {
  readonly filename?: string
  readonly mediaType: string
  readonly filePath?: string
  readonly tempPath?: string
  readonly hash?: ReturnType<typeof createHash>
  readonly file?: Awaited<ReturnType<typeof open>>
  size: number
}

function isInside(root: string, candidate: string): boolean {
  const child = relative(resolve(root), resolve(candidate))
  return child === '' || (child !== '..' && !child.startsWith(`..${'\\'}`) && !child.startsWith(`..${'/'}`) && !isAbsolute(child))
}

function invalid(message: string, cause?: unknown): ApplicationServiceError {
  return new ApplicationServiceError('invalid_input', message, cause === undefined ? undefined : { cause })
}

function parseBoundary(contentType: string): string {
  if (typeof contentType !== 'string' || !/^multipart\/form-data\s*;/i.test(contentType)) throw invalid('Content-Type must be multipart/form-data')
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  const boundary = match?.[1] ?? match?.[2]
  if (!boundary || boundary.length > 200 || /[\u0000-\u001f\u007f]/.test(boundary)) throw invalid('multipart boundary is invalid')
  return boundary
}

function headerValue(headers: string, name: string): string | undefined {
  const line = headers.split('\r\n').find((item) => item.toLowerCase().startsWith(`${name.toLowerCase()}:`))
  return line?.slice(line.indexOf(':') + 1).trim()
}

function dispositionParameter(value: string | undefined, parameter: string): string | undefined {
  if (!value) return undefined
  const expression = new RegExp(`(?:^|;)\\s*${parameter}=(?:"((?:[^"\\\\]|\\\\.)*)"|([^;\\s]+))`, 'i')
  const match = expression.exec(value)
  if (!match) return undefined
  return (match[1] ?? match[2] ?? '').replace(/\\(["\\\\])/g, '$1')
}

function normalizeFilename(value: string | undefined): string {
  if (value === undefined || value === '') return 'upload.bin'
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) throw invalid('filename contains a NUL or control character')
  const candidate = value.normalize('NFC').replace(/[\\/]+/g, '/').split('/').filter(Boolean).pop()?.trim() ?? ''
  if (candidate === '' || candidate === '.' || candidate === '..') return 'upload.bin'
  if (/[\u0000-\u001f\u007f-\u009f]/.test(candidate)) throw invalid('filename contains a NUL or control character')
  const bounded = [...candidate].slice(0, 255).join('').replace(/[. ]+$/g, '')
  if (bounded === '' || bounded === '.' || bounded === '..') return 'upload.bin'
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(bounded)) return 'upload.bin'
  if (RESERVED_ATTACHMENT_FILENAMES.has(bounded.toLowerCase()) || bounded.toLowerCase().startsWith('.metadata.') || bounded.toLowerCase().startsWith('.upload.')) return 'upload.bin'
  return bounded
}

async function assertDirectory(path: string, label: string): Promise<string> {
  let info
  try { info = await lstat(path) } catch (error) { throw invalid(`${label} is not available`, error) }
  if (!info.isDirectory() || info.isSymbolicLink()) throw invalid(`${label} must be a real directory`)
  return realpath(path)
}

async function removeOwnedDirectory(path: string): Promise<void> {
  try {
    const info = await lstat(path)
    if (info.isSymbolicLink()) await unlink(path)
    else if (info.isDirectory()) await rm(path, { recursive: true, force: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw error
  }
}

/** Controlled, streaming workspace attachment storage. Uploads never mutate canonical Knowledge. */
export class AttachmentService {
  readonly workspaceRoot: string
  readonly maxBytes: number
  private readonly uploadsRoot: string
  private initialized?: Promise<string>

  constructor(options: AttachmentServiceOptions) {
    this.workspaceRoot = resolve(options.workspaceRoot)
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes < 1 || this.maxBytes > DEFAULT_MAX_ATTACHMENT_BYTES) throw new RangeError('maxBytes is outside the supported attachment limit')
    this.uploadsRoot = join(this.workspaceRoot, 'uploads')
  }

  private async storageRoot(): Promise<string> {
    if (!this.initialized) {
      this.initialized = (async () => {
        await mkdir(this.workspaceRoot, { recursive: true })
        const workspaceReal = await assertDirectory(this.workspaceRoot, 'workspaceRoot')
        await mkdir(this.uploadsRoot, { recursive: true })
        const uploadsReal = await assertDirectory(this.uploadsRoot, 'uploads directory')
        if (!isInside(workspaceReal, uploadsReal)) throw invalid('uploads directory escapes workspaceRoot')
        return uploadsReal
      })().catch((error) => { this.initialized = undefined; throw error })
    }
    return this.initialized
  }

  async upload(body: AsyncIterable<Uint8Array>, contentType: string): Promise<AttachmentRef> {
    const boundary = parseBoundary(contentType)
    const uploadsRoot = await this.storageRoot()
    const attachmentId = randomUUID()
    const attachmentDirectory = join(uploadsRoot, attachmentId)
    await mkdir(attachmentDirectory, { recursive: false })
    let active: ActivePart | undefined
    let completedFile: ActivePart | undefined
    let filePartCount = 0
    let totalReceived = 0
    let parserState: 'preamble' | 'headers' | 'body' | 'boundary' | 'done' = 'preamble'
    let buffer = Buffer.alloc(0)
    const marker = Buffer.from(`--${boundary}`)
    const bodyDelimiter = Buffer.from(`\r\n--${boundary}`)
    const tempPath = join(attachmentDirectory, '.upload.tmp')
    let finalized = false

    const writeBody = async (chunk: Buffer): Promise<void> => {
      if (chunk.length === 0) return
      if (active?.file) {
        active.size += chunk.length
        if (active.size > this.maxBytes) throw invalid(`attachment exceeds the ${this.maxBytes} byte limit`)
        active.hash!.update(chunk)
        await active.file.write(chunk)
      }
    }

    const finishPart = async (): Promise<void> => {
      if (active?.file) {
        await active.file.sync()
        await active.file.close()
      }
      if (active?.filename) completedFile = active
      active = undefined
    }

    const beginPart = async (headerText: string): Promise<void> => {
      const disposition = headerValue(headerText, 'content-disposition')
      if (!disposition || !/^form-data\s*(?:;|$)/i.test(disposition)) throw invalid('multipart part is missing Content-Disposition')
      const filename = dispositionParameter(disposition, 'filename')
      const mediaType = (headerValue(headerText, 'content-type') ?? 'application/octet-stream').split(';', 1)[0]!.trim().toLowerCase()
      if (!/^[a-z][a-z0-9+.-]*\/[a-z0-9!#$&^_.+-]+$/i.test(mediaType)) throw invalid('multipart file media type is invalid')
      if (filename === undefined) { active = { mediaType, size: 0 }; return }
      filePartCount += 1
      if (filePartCount !== 1) throw invalid('exactly one file part is required')
      const safeFilename = normalizeFilename(filename)
      const file = await open(tempPath, 'wx', 0o600)
      active = { filename: safeFilename, mediaType, filePath: join(attachmentDirectory, safeFilename), tempPath, hash: createHash('sha256'), file, size: 0 }
    }

    const parseBuffer = async (final: boolean): Promise<void> => {
      for (;;) {
        if (parserState === 'done') return
        if (parserState === 'preamble') {
          const index = buffer.indexOf(marker)
          if (index < 0) {
            if (buffer.length > MAX_MULTIPART_OVERHEAD_BYTES) throw invalid('multipart preamble is invalid')
            return
          }
          const afterMarker = buffer.subarray(index + marker.length)
          if (afterMarker.length < 2) { if (final) throw invalid('multipart boundary terminator is incomplete'); return }
          if (afterMarker.subarray(0, 2).equals(Buffer.from('--'))) { buffer = afterMarker.subarray(2); parserState = 'done'; return }
          if (!afterMarker.subarray(0, 2).equals(Buffer.from('\r\n'))) { if (final) throw invalid('multipart boundary is malformed'); return }
          buffer = afterMarker.subarray(2); parserState = 'headers'
        }
        if (parserState === 'headers') {
          const end = buffer.indexOf(Buffer.from('\r\n\r\n'))
          if (end < 0) { if (buffer.length > MAX_MULTIPART_HEADER_BYTES || final) throw invalid('multipart headers are incomplete'); return }
          const headers = buffer.subarray(0, end).toString('utf8')
          buffer = buffer.subarray(end + 4)
          await beginPart(headers)
          parserState = 'body'
        }
        if (parserState === 'body') {
          const index = buffer.indexOf(bodyDelimiter)
          if (index < 0) {
            const emitLength = Math.max(0, buffer.length - bodyDelimiter.length + 1)
            if (emitLength > 0) { await writeBody(buffer.subarray(0, emitLength)); buffer = buffer.subarray(emitLength) }
            if (final) throw invalid('multipart body is incomplete')
            return
          }
          const afterDelimiter = buffer.subarray(index + bodyDelimiter.length)
          if (afterDelimiter.length < 2) { if (final) throw invalid('multipart closing boundary is incomplete'); return }
          const isBoundaryTerminator = afterDelimiter.subarray(0, 2).equals(Buffer.from('--')) || afterDelimiter.subarray(0, 2).equals(Buffer.from('\r\n'))
          if (!isBoundaryTerminator) {
            await writeBody(buffer.subarray(0, index + bodyDelimiter.length))
            buffer = afterDelimiter
            continue
          }
          await writeBody(buffer.subarray(0, index))
          await finishPart()
          buffer = afterDelimiter; parserState = 'boundary'
        }
        if (parserState === 'boundary') {
          if (buffer.length < 2) { if (final) throw invalid('multipart closing boundary is incomplete'); return }
          if (buffer.subarray(0, 2).equals(Buffer.from('--'))) { buffer = buffer.subarray(2); parserState = 'done'; return }
          if (!buffer.subarray(0, 2).equals(Buffer.from('\r\n'))) throw invalid('multipart boundary terminator is malformed')
          buffer = buffer.subarray(2); parserState = 'headers'
        }
      }
    }

    try {
      for await (const input of body) {
        const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input)
        totalReceived += chunk.length
        if (totalReceived > this.maxBytes + MAX_MULTIPART_OVERHEAD_BYTES) throw invalid('multipart request exceeds the supported size limit')
        buffer = Buffer.concat([buffer, chunk])
        await parseBuffer(false)
      }
      await parseBuffer(true)
      if ((parserState as string) !== 'done' || filePartCount !== 1 || !completedFile?.filename) throw invalid('exactly one file part is required')
      const completedPart = completedFile
      const safeFilename = normalizeFilename(completedPart.filename)
      const finalPath = join(attachmentDirectory, safeFilename)
      await rename(tempPath, finalPath)
      const createdAt = new Date().toISOString()
      const workspaceReal = await realpath(this.workspaceRoot)
      const workspaceRelativePath = relative(workspaceReal, finalPath).replace(/\\/g, '/')
      if (isAbsolute(workspaceRelativePath) || !isInside(workspaceReal, finalPath) || !isInside(uploadsRoot, finalPath)) throw invalid('attachment path escapes workspaceRoot')
      const metadata: StoredMetadata = { version: 1, attachmentId, filename: safeFilename, mediaType: completedPart.mediaType, size: completedPart.size, sha256: completedPart.hash!.digest('hex'), createdAt, workspaceRelativePath }
      const metadataTemp = join(attachmentDirectory, '.metadata.tmp')
      await writeFile(metadataTemp, JSON.stringify(metadata), { encoding: 'utf8', mode: 0o600 })
      await rename(metadataTemp, join(attachmentDirectory, 'metadata.json'))
      finalized = true
      return toDto(metadata)
    } catch (error) {
      const abortable = body as AsyncIterable<Uint8Array> & { readonly destroy?: (error?: Error) => void }
      try { abortable.destroy?.(error instanceof Error ? error : new Error('attachment upload failed')) } catch { /* request abort is best effort */ }
      try { if (active?.file) await active.file.close() } catch { /* cleanup is best effort */ }
      await removeOwnedDirectory(attachmentDirectory)
      if (error instanceof ApplicationServiceError) throw error
      throw invalid('attachment upload failed', error)
    } finally {
      if (!finalized) await removeOwnedDirectory(attachmentDirectory)
    }
  }

  async getAttachment(attachmentId: string): Promise<AttachmentRef> {
    const metadata = await this.readAndValidate(attachmentId)
    return toDto(metadata)
  }

  async resolveAttachmentPath(attachmentId: string): Promise<string> {
    const metadata = await this.readAndValidate(attachmentId)
    return join(await this.storageRoot(), attachmentId, metadata.filename)
  }

  async openAttachment(attachmentId: string): Promise<{ readonly metadata: AttachmentRef; readonly path: string }> {
    const metadata = await this.readAndValidate(attachmentId)
    return { metadata: toDto(metadata), path: join(await this.storageRoot(), attachmentId, metadata.filename) }
  }

  private async readAndValidate(attachmentId: string): Promise<StoredMetadata> {
    if (typeof attachmentId !== 'string' || !ATTACHMENT_ID.test(attachmentId)) throw new ApplicationServiceError('invalid_input', 'attachmentId is invalid')
    const uploadsRoot = await this.storageRoot()
    const directory = join(uploadsRoot, attachmentId)
    const directoryInfo = await lstat(directory).catch(() => undefined)
    if (!directoryInfo || !directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new ApplicationServiceError('not_found', 'Attachment not found')
    const directoryReal = await realpath(directory).catch(() => '')
    if (!isInside(uploadsRoot, directoryReal) || directoryReal !== resolve(directory)) throw new ApplicationServiceError('invalid_input', 'Attachment storage boundary is invalid')
    let metadata: StoredMetadata
    try { metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8')) as StoredMetadata } catch (error) { throw invalid('Attachment metadata is unavailable', error) }
    if (metadata.version !== 1 || metadata.attachmentId !== attachmentId || typeof metadata.filename !== 'string' || metadata.filename !== normalizeFilename(metadata.filename) || typeof metadata.mediaType !== 'string' || typeof metadata.size !== 'number' || !Number.isSafeInteger(metadata.size) || metadata.size < 0 || metadata.size > this.maxBytes || typeof metadata.sha256 !== 'string' || !SHA256.test(metadata.sha256) || typeof metadata.createdAt !== 'string' || !Number.isFinite(Date.parse(metadata.createdAt)) || typeof metadata.workspaceRelativePath !== 'string') throw invalid('Attachment metadata is invalid')
    const expectedPath = join(directory, metadata.filename)
    const workspaceReal = await realpath(this.workspaceRoot)
    if (metadata.workspaceRelativePath !== relative(workspaceReal, expectedPath).replace(/\\/g, '/') || !isInside(directory, expectedPath) || isAbsolute(metadata.workspaceRelativePath)) throw invalid('Attachment metadata path is invalid')
    const fileInfo = await lstat(expectedPath).catch(() => undefined)
    if (!fileInfo || !fileInfo.isFile() || fileInfo.isSymbolicLink()) throw invalid('Attachment file is invalid')
    const fileReal = await realpath(expectedPath).catch(() => '')
    if (!isInside(directoryReal, fileReal) || fileReal !== resolve(expectedPath)) throw invalid('Attachment file escapes its storage directory')
    if (fileInfo.size !== metadata.size) throw invalid('Attachment metadata size does not match the file')
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(expectedPath)) hash.update(chunk)
    if (hash.digest('hex') !== metadata.sha256.toLowerCase()) throw invalid('Attachment metadata hash does not match the file')
    return metadata
  }
}

function toDto(metadata: StoredMetadata): AttachmentRef {
  return { attachmentId: metadata.attachmentId, filename: metadata.filename, mediaType: metadata.mediaType, size: metadata.size, sha256: metadata.sha256, createdAt: metadata.createdAt, workspaceRelativePath: metadata.workspaceRelativePath }
}

export { normalizeFilename }
