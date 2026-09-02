import { DocumentPluginError } from './errors.ts'
import type { DocumentBlock, DocumentSection, StructuredDocument } from './contracts.ts'

const BLOCK_TYPES = new Set(['heading', 'paragraph', 'table', 'list', 'caption', 'other'])

function invalid(message: string): never { throw new DocumentPluginError('document_structure_invalid', message) }
function nonEmpty(value: unknown, field: string): string { if (typeof value !== 'string' || value.trim() === '') invalid(`${field} must be a non-empty string`); return value }
function positivePage(value: number | null, field: string): void { if (value !== null && (!Number.isInteger(value) || value < 1)) invalid(`${field} must be null or a positive integer`) }

export function validateStructuredDocument(document: StructuredDocument): StructuredDocument {
  if (!document || typeof document !== 'object') invalid('StructuredDocument must be an object')
  nonEmpty(document.documentId, 'documentId')
  if (!document.parser || typeof document.parser !== 'object') invalid('parser identity is required')
  nonEmpty(document.parser.id, 'parser.id')
  if (!document.metadata || typeof document.metadata !== 'object') invalid('metadata is required')
  nonEmpty(document.metadata.mediaType, 'metadata.mediaType')
  if (!Array.isArray(document.sections) || !Array.isArray(document.blocks)) invalid('sections and blocks must be arrays')

  const sections = new Map<string, DocumentSection>()
  for (const section of document.sections) {
    nonEmpty(section.sectionId, 'sectionId')
    if (sections.has(section.sectionId)) invalid(`duplicate sectionId: ${section.sectionId}`)
    if (!Array.isArray(section.blockRefs)) invalid(`section blockRefs must be an array: ${section.sectionId}`)
    if (section.level !== null && (!Number.isInteger(section.level) || section.level < 1)) invalid(`section level is invalid: ${section.sectionId}`)
    positivePage(section.pageStart, 'section.pageStart'); positivePage(section.pageEnd, 'section.pageEnd')
    if (section.pageStart !== null && section.pageEnd !== null && section.pageEnd < section.pageStart) invalid(`section page range is inverted: ${section.sectionId}`)
    sections.set(section.sectionId, section)
  }

  const blocks = new Map<string, DocumentBlock>()
  const orders = new Set<number>()
  for (const block of document.blocks) {
    nonEmpty(block.blockId, 'blockId')
    if (blocks.has(block.blockId)) invalid(`duplicate blockId: ${block.blockId}`)
    if (!BLOCK_TYPES.has(block.type)) invalid(`unsupported block type: ${String(block.type)}`)
    if (typeof block.text !== 'string' || block.text.trim() === '') invalid(`block text must be non-empty: ${block.blockId}`)
    if (!Number.isInteger(block.order) || block.order < 1 || orders.has(block.order)) invalid(`block order must be unique positive integer: ${block.blockId}`)
    orders.add(block.order); positivePage(block.page, 'block.page')
    if (!block.locator || typeof block.locator !== 'object') invalid(`block locator is required: ${block.blockId}`)
    if (block.locator.page !== block.page) invalid(`block locator page must match block page: ${block.blockId}`)
    if (block.sectionRef !== null && !sections.has(block.sectionRef)) invalid(`dangling block sectionRef: ${block.blockId}`)
    blocks.set(block.blockId, block)
  }
  const ordered = [...orders].sort((a, b) => a - b)
  if (ordered.some((order, index) => order !== index + 1)) invalid('block order must be a contiguous deterministic sequence starting at 1')

  for (const section of sections.values()) {
    if (section.parentSectionRef !== null && !sections.has(section.parentSectionRef)) invalid(`dangling parentSectionRef: ${section.sectionId}`)
    for (const blockRef of section.blockRefs) {
      if (!blocks.has(blockRef)) invalid(`dangling section blockRef: ${section.sectionId} -> ${blockRef}`)
      if (blocks.get(blockRef)?.sectionRef !== section.sectionId) invalid(`section/block ownership mismatch: ${section.sectionId} -> ${blockRef}`)
    }
  }
  for (const section of sections.values()) {
    const visited = new Set<string>(); let cursor: string | null = section.sectionId
    while (cursor !== null) {
      if (visited.has(cursor)) invalid(`cyclic section hierarchy at: ${section.sectionId}`)
      visited.add(cursor); cursor = sections.get(cursor)?.parentSectionRef ?? null
    }
  }
  if (typeof document.normalizedText !== 'string') invalid('normalizedText must be a string')
  if (document.blocks.length > 0 && document.normalizedText.trim() === '') invalid('normalizedText must be non-empty for text-bearing documents')
  positivePage(document.metadata.pageCount ?? null, 'metadata.pageCount')
  const stats = document.stats
  if (!stats || stats.blockCount !== document.blocks.length || stats.sectionCount !== document.sections.length) invalid('document stats do not match sections and blocks')
  return document
}
