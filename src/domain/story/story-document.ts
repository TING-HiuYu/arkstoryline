import type { ChapterNavigation } from '../catalog/chapter-navigation'
import type { CitationRef } from '../catalog/citation-ref'
import type { StoryBlock } from './story-block'

export interface StoryDocumentBuildDiagnostic {
  code: 'missing-story-text'
  message: string
  storyTxt?: string
  sourcePath?: string
}

export interface StoryDocument {
  id: string
  albumId: string
  locale: string
  title: string
  subtitle?: string
  code?: string
  avgTag?: string
  summary?: string
  sourcePath: string
  blocks: StoryBlock[]
  plainText: string
  navigation: ChapterNavigation
  citations: CitationRef[]
  buildDiagnostics?: StoryDocumentBuildDiagnostic[]
}
