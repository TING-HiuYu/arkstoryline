import type { ExportDocument } from './export-document'
import type { ExportFormat } from './export-format'
import type { ExportSelection } from './export-selection'

export interface ExportArtifact {
  fileName: string
  mimeType: string
  data: Uint8Array
}

export interface ExportRenderInput {
  document: ExportDocument
  selection: ExportSelection
  includeImages: boolean
}

export interface ExportRenderer {
  format: ExportFormat
  render(input: ExportRenderInput): Promise<ExportArtifact[]>
}
