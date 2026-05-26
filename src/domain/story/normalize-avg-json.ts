import type { RawStoryJson } from '../../../scripts/transform/raw-models/raw-story-json'
import { buildStableStoryJsonAlbumId } from '../../../scripts/transform/stable-public-id'
import { normalizeStoryJsonChapter } from '../../../scripts/transform/story-json-chapter-normalizer'

import { normalizeAvgNodes } from './normalize-avg-nodes'
import type { StoryDocument } from './story-document'

export function normalizeAvgJson(input: RawStoryJson): StoryDocument {
  const chapter = normalizeStoryJsonChapter(input)

  return normalizeAvgNodes(chapter.nodes, {
    id: chapter.id,
    albumId: buildAlbumId(chapter.eventId, chapter.eventName, chapter.storyCode),
    locale: chapter.locale,
    title: chapter.title,
    subtitle: chapter.eventName,
    sourcePath: resolveSourcePath(input, chapter.id),
    code: chapter.storyCode,
    avgTag: chapter.avgTag,
    summary: chapter.summary,
  })
}

function buildAlbumId(
  eventId: string | undefined,
  eventName: string | undefined,
  storyCode: string | undefined
): string {
  return buildStableStoryJsonAlbumId({
    eventId,
    eventName,
    storyCode,
  })
}

function resolveSourcePath(input: RawStoryJson, chapterId: string): string {
  const sourcePath = toTrimmedString(input.sourcePath)

  if (sourcePath) {
    return sourcePath
  }

  return `storyjson/${chapterId}.json`
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
