export interface CitationRef {
  id: string
  referenceId: string
  blockId: string
  textRange?: {
    start: number
    end: number
  }
  marker: number
}
