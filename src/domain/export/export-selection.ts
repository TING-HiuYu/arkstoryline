import type { AppLocale } from '../../app/i18n'
import type { ExportFileMode } from './export-format'

export interface ExportSelectionItem {
  albumId: string
  chapterIds: string[]
}

export interface ExportSelection {
  locale: AppLocale
  items: ExportSelectionItem[]
  fileMode: ExportFileMode
  includeImages?: boolean
  doctorName?: string | null
}
