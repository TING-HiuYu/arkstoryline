export type SyncReportStatus = 'success' | 'skipped' | 'failed'

export type SyncReportFileStatus = 'downloaded' | 'cached' | 'failed'

export interface SyncReportFileResult {
  path: string
  status: SyncReportFileStatus
  bytes?: number
  error?: string
}

export interface SyncReportTotals {
  files: number
  downloaded: number
  cached: number
  failed: number
}

export interface SyncReportParseError {
  path: string
  stage: string
  message: string
}

export interface SyncReportMissingFile {
  path: string
  stage: string
  message: string
}

export interface SyncReportDiagnostics {
  parseErrors: SyncReportParseError[]
  missingFiles: SyncReportMissingFile[]
}

export interface SyncReport {
  locale: string
  providerId: string
  revision: string
  status: SyncReportStatus
  reason?: string
  startedAt: string
  finishedAt: string
  durationMs: number
  totals: SyncReportTotals
  files: SyncReportFileResult[]
  diagnostics: SyncReportDiagnostics
}

export interface CreateSyncReportInput {
  locale: string
  providerId: string
  revision: string
  status: SyncReportStatus
  reason?: string
  startedAt: Date | string
  finishedAt: Date | string
  files?: ReadonlyArray<SyncReportFileResult>
  diagnostics?: Partial<SyncReportDiagnostics>
}

export function createSyncReport(input: CreateSyncReportInput): SyncReport {
  const startedAt = toDate(input.startedAt, 'startedAt')
  const finishedAt = toDate(input.finishedAt, 'finishedAt')

  if (finishedAt.getTime() < startedAt.getTime()) {
    throw new Error('[createSyncReport] finishedAt must be greater than or equal to startedAt.')
  }

  const files = [...(input.files ?? [])]
  const totals = computeTotals(files)
  const diagnostics: SyncReportDiagnostics = {
    parseErrors: [...(input.diagnostics?.parseErrors ?? [])],
    missingFiles: [...(input.diagnostics?.missingFiles ?? [])],
  }

  return {
    locale: input.locale,
    providerId: input.providerId,
    revision: input.revision,
    status: input.status,
    reason: input.reason,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    totals,
    files,
    diagnostics,
  }
}

function computeTotals(files: ReadonlyArray<SyncReportFileResult>): SyncReportTotals {
  return files.reduce<SyncReportTotals>(
    (accumulator, file) => {
      if (file.status === 'downloaded') {
        accumulator.downloaded += 1
      }

      if (file.status === 'cached') {
        accumulator.cached += 1
      }

      if (file.status === 'failed') {
        accumulator.failed += 1
      }

      accumulator.files += 1
      return accumulator
    },
    {
      files: 0,
      downloaded: 0,
      cached: 0,
      failed: 0,
    }
  )
}

function toDate(value: Date | string, field: 'startedAt' | 'finishedAt'): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`[createSyncReport] ${field} must be a valid date.`)
    }

    return value
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`[createSyncReport] ${field} must be a valid ISO date string.`)
  }

  return parsed
}
