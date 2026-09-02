import { DocumentPluginError } from './errors.ts'
import type { DocumentParser, DocumentParserInput } from './contracts.ts'

export class DocumentParserRegistry {
  private readonly providers: readonly DocumentParser[]

  constructor(providers: readonly DocumentParser[]) {
    const ids = new Set<string>()
    for (const provider of providers) {
      if (!provider.id.trim()) throw new DocumentPluginError('document_parser_unavailable', 'Document parser ID must be non-empty')
      if (ids.has(provider.id)) throw new DocumentPluginError('document_parser_unavailable', `Duplicate document parser ID: ${provider.id}`)
      ids.add(provider.id)
    }
    this.providers = [...providers]
  }

  get providerIds(): string[] { return this.providers.map((provider) => provider.id) }

  select(input: Pick<DocumentParserInput, 'filename' | 'mediaType'>, requestedId?: string): DocumentParser {
    if (requestedId !== undefined && requestedId.trim() !== '') {
      const provider = this.providers.find((candidate) => candidate.id === requestedId)
      if (!provider) throw new DocumentPluginError('document_parser_unavailable', `document_parser_unavailable: ${requestedId}`)
      if (!provider.supports(input)) throw new DocumentPluginError('document_parser_unsupported', `document_parser_unsupported: ${requestedId}`)
      return provider
    }
    const provider = this.providers.find((candidate) => candidate.supports(input))
    if (!provider) throw new DocumentPluginError('document_parser_unsupported', `document_parser_unsupported: ${input.filename}`)
    return provider
  }
}
