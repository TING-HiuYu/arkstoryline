import type { AvgNode } from '../../../scripts/transform/avg-script-parser'

import type { ChapterNavigation } from '../catalog/chapter-navigation'
import type { CitationRef } from '../catalog/citation-ref'
import { buildPlainText } from './build-plain-text'
import type { StoryBlock } from './story-block'
import type { StoryDocument } from './story-document'

export interface StoryContext {
  id: string
  albumId: string
  locale: string
  title: string
  sourcePath: string
  subtitle?: string
  code?: string
  avgTag?: string
  summary?: string
  navigation?: ChapterNavigation
  citations?: CitationRef[]
}

const DEFAULT_NAVIGATION: ChapterNavigation = {
  previousChapterId: null,
  nextChapterId: null,
}

function toStoryBlock(node: AvgNode): StoryBlock {
  switch (node.type) {
    case 'dialogue':
      return {
        type: 'dialogue',
        id: node.id,
        speaker: node.speaker,
        text: node.text,
      }
    case 'narration':
      return {
        type: 'narration',
        id: node.id,
        text: node.text,
      }
    case 'choice':
      return {
        type: 'choice',
        id: node.id,
        options: [...node.options],
      }
    case 'sectionBreak':
      return {
        type: 'sectionBreak',
        id: node.id,
        variant: node.variant,
      }
    case 'cue':
      return {
        type: 'unknownCue',
        id: node.id,
        prop: node.cue,
        attributes: {
          args: node.args,
          line: node.line,
        },
      }
    case 'unknownCue':
      return {
        type: 'unknownCue',
        id: node.id,
        prop: node.prop,
        attributes: { ...node.attributes },
      }
    default:
      return assertNever(node)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported avg node type: ${JSON.stringify(value)}`)
}

export function normalizeAvgNodes(input: AvgNode[], context: StoryContext): StoryDocument {
  const blocks = input.map(toStoryBlock)

  return {
    id: context.id,
    albumId: context.albumId,
    locale: context.locale,
    title: context.title,
    subtitle: context.subtitle,
    code: context.code,
    avgTag: context.avgTag,
    summary: context.summary,
    sourcePath: context.sourcePath,
    blocks,
    plainText: buildPlainText(blocks),
    navigation: context.navigation ?? DEFAULT_NAVIGATION,
    citations: context.citations ? [...context.citations] : [],
  }
}
