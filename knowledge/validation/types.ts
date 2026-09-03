import type { KnowledgeChangeSetV03, ValidatedKnowledgeChangeSetV03 } from '../schema/mutation.ts'
import type { KnowledgeBaseHandle } from '../storage/handle.ts'

export type ValidationSeverity = 'error' | 'warning' | 'info'
export type ValidationScope = 'all' | 'manifest' | 'raw' | 'entity' | 'relation' | 'claim' | 'module' | 'source' | 'registry'

export interface ValidationDiagnostic {
  readonly code: string
  readonly severity: ValidationSeverity
  readonly message: string
  readonly assetId?: string
  readonly operationId?: string
  readonly filePath?: string
}

export interface ValidationReport {
  readonly status: 'passed' | 'failed'
  readonly errors: readonly ValidationDiagnostic[]
  readonly warnings: readonly ValidationDiagnostic[]
  readonly info: readonly ValidationDiagnostic[]
  readonly scope: ValidationScope
}

export interface V03CanonicalObject { readonly kind: CanonicalKind; readonly object: Record<string, unknown> }
export type CanonicalKind = 'theme_group' | 'entity' | 'relation' | 'claim' | 'module' | 'source'
export interface V03CanonicalValidationContext { readonly objects: ReadonlyMap<string, V03CanonicalObject>; readonly rawRefs: ReadonlySet<string>; readonly taxonomyRefs: ReadonlySet<string> }
export interface V03DiagnosticContext { readonly operationId?: string; readonly assetId?: string; readonly filePath?: string }

export interface ChangeSetValidationOptions { readonly mode?: 'commit' | 'dry_run'; readonly virtualRawRefs?: readonly string[] }
export interface ChangeSetValidationResult { readonly report: ValidationReport; readonly validatedChangeSet?: ValidatedKnowledgeChangeSetV03 }
export type { KnowledgeBaseHandle, KnowledgeChangeSetV03, ValidatedKnowledgeChangeSetV03 }
