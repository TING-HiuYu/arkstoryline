import type {
  AvgChoiceNode,
  AvgCueNode,
  AvgDialogueNode,
  AvgNode,
  AvgNarrationNode,
  AvgSectionBreakNode,
  UnknownCueBlock,
} from './avg-script-parser'
import type { RawStoryJson, RawStoryJsonStoryNode } from './raw-models/raw-story-json'
import type { RawStoryReviewEntryType } from './raw-models/raw-story-review-entry'
import {
  buildStableStoryJsonChapterId,
  buildStableStoryNodeId,
  createStableNodeIdState,
} from './stable-public-id'

export interface NormalizedStoryJsonChapter {
  id: string
  locale: string
  sourceType: 'storyJson'
  albumKind?: RawStoryReviewEntryType
  eventId?: string
  eventName?: string
  storyCode?: string
  avgTag?: string
  title: string
  summary?: string
  nodes: AvgNode[]
  optionTrace: readonly unknown[] | Record<string, unknown> | null
}

const CHOICE_SEPARATOR_PATTERN = /\s*(?:\/|\||;|；)\s*/

export function normalizeStoryJsonChapter(rawStoryJson: RawStoryJson): NormalizedStoryJsonChapter {
  const storyList = Array.isArray(rawStoryJson.storyList) ? rawStoryJson.storyList : []
  const nodes: AvgNode[] = []
  const nodeIdState = createStableNodeIdState()
  let activeSpeaker: string | null = null

  for (let index = 0; index < storyList.length; index += 1) {
    const rawNode = storyList[index]

    if (!rawNode) {
      continue
    }

    const line = index + 1
    const id = buildStableStoryNodeId(rawNode.id, rawNode, nodeIdState)
    const raw = stringifyNode(rawNode)
    const prop = toTrimmedString(rawNode.prop)
    const attributes = toRecord(rawNode.attributes)
    const text = pickText(rawNode, attributes)
    const speaker = pickSpeaker(rawNode, attributes)

    if (equalsIgnoreCase(prop, 'Dialog')) {
      nodes.push(createSectionBreakNode(id, line, raw, 'scene'))
      continue
    }

    if (equalsIgnoreCase(prop, 'Decision')) {
      const options = pickDecisionOptions(rawNode, attributes)

      if (options.length > 0) {
        nodes.push(createChoiceNode(id, line, raw, options))
      } else {
        nodes.push(createUnknownCueNode(id, line, raw, prop, attributes))
      }
      continue
    }

    if (equalsIgnoreCase(prop, 'name')) {
      if (speaker && !text) {
        activeSpeaker = speaker
        nodes.push(createNameCueNode(id, line, raw, speaker))
        continue
      }

      if (text) {
        const resolvedSpeaker: string | null = speaker ?? activeSpeaker

        if (resolvedSpeaker) {
          activeSpeaker = resolvedSpeaker
          nodes.push(createDialogueNode(id, line, raw, resolvedSpeaker, text))
        } else {
          nodes.push(createNarrationNode(id, line, raw, text))
        }
        continue
      }

      nodes.push(createUnknownCueNode(id, line, raw, prop, attributes))
      continue
    }

    if (text) {
      nodes.push(createNarrationNode(id, line, raw, text))
      continue
    }

    nodes.push(createUnknownCueNode(id, line, raw, prop, attributes))
  }

  return {
    id: buildChapterId(rawStoryJson),
    locale: toTrimmedString(rawStoryJson.lang) ?? 'unknown',
    sourceType: 'storyJson',
    albumKind: rawStoryJson.albumKind,
    eventId: toTrimmedString(rawStoryJson.eventid),
    eventName: toTrimmedString(rawStoryJson.eventName),
    storyCode: toTrimmedString(rawStoryJson.storyCode),
    avgTag: toTrimmedString(rawStoryJson.avgTag),
    title: pickChapterTitle(rawStoryJson),
    summary: toTrimmedString(rawStoryJson.storyInfo),
    nodes,
    optionTrace: normalizeOptionTrace(rawStoryJson.OPTIONTRACE),
  }
}

function pickChapterTitle(rawStoryJson: RawStoryJson): string {
  return (
    toTrimmedString(rawStoryJson.storyName) ??
    toTrimmedString(rawStoryJson.storyCode) ??
    toTrimmedString(rawStoryJson.eventName) ??
    'Untitled chapter'
  )
}

function buildChapterId(rawStoryJson: RawStoryJson): string {
  return buildStableStoryJsonChapterId({
    storyCode: rawStoryJson.storyCode,
    avgTag: rawStoryJson.avgTag,
    storyName: rawStoryJson.storyName,
    eventId: rawStoryJson.eventid,
  })
}

function stringifyNode(rawNode: RawStoryJsonStoryNode): string {
  try {
    return JSON.stringify(rawNode)
  } catch {
    return '[unserializable-story-node]'
  }
}

function pickText(
  rawNode: RawStoryJsonStoryNode,
  attributes: Record<string, unknown> | null
): string | undefined {
  return (
    pickString(attributes, ['text', 'content', 'dialogue', 'value']) ??
    pickString(rawNode, ['text', 'content', 'dialogue', 'value'])
  )
}

function pickSpeaker(
  rawNode: RawStoryJsonStoryNode,
  attributes: Record<string, unknown> | null
): string | undefined {
  return (
    pickString(attributes, ['name', 'speaker', 'character', 'charName']) ??
    pickString(rawNode, ['name', 'speaker', 'character', 'charName'])
  )
}

function pickDecisionOptions(
  rawNode: RawStoryJsonStoryNode,
  attributes: Record<string, unknown> | null
): string[] {
  const fromAttributes =
    pickArray(attributes, ['options', 'choices', 'items']) ??
    splitOptions(pickString(attributes, ['options', 'option', 'choices', 'items', 'text']) ?? '')

  if (fromAttributes.length > 0) {
    return fromAttributes
  }

  const fromNode =
    pickArray(rawNode, ['options', 'choices', 'items']) ??
    splitOptions(pickString(rawNode, ['options', 'option', 'choices', 'items', 'text']) ?? '')

  return fromNode
}

function splitOptions(value: string): string[] {
  if (value.length === 0) {
    return []
  }

  return value
    .split(CHOICE_SEPARATOR_PATTERN)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function pickArray(
  value: Record<string, unknown> | RawStoryJsonStoryNode | null,
  keys: readonly string[]
): string[] | null {
  if (!value) {
    return null
  }

  for (const key of keys) {
    const candidate = value[key]

    if (!Array.isArray(candidate)) {
      continue
    }

    const normalized = candidate
      .map((item) => toTrimmedString(item))
      .filter((item): item is string => Boolean(item))

    if (normalized.length > 0) {
      return normalized
    }
  }

  return null
}

function pickString(
  value: Record<string, unknown> | RawStoryJsonStoryNode | null,
  keys: readonly string[]
): string | undefined {
  if (!value) {
    return undefined
  }

  for (const key of keys) {
    const candidate = toTrimmedString(value[key])

    if (candidate) {
      return candidate
    }
  }

  return undefined
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return undefined
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function normalizeOptionTrace(
  optionTrace: RawStoryJson['OPTIONTRACE']
): readonly unknown[] | Record<string, unknown> | null {
  if (Array.isArray(optionTrace)) {
    return optionTrace
  }

  if (optionTrace && typeof optionTrace === 'object') {
    return optionTrace as Record<string, unknown>
  }

  return null
}

function equalsIgnoreCase(value: string | undefined, expected: string): boolean {
  return value?.toLowerCase() === expected.toLowerCase()
}

function createSectionBreakNode(
  id: string,
  line: number,
  raw: string,
  variant: AvgSectionBreakNode['variant']
): AvgSectionBreakNode {
  return {
    id,
    type: 'sectionBreak',
    line,
    raw,
    variant,
  }
}

function createChoiceNode(id: string, line: number, raw: string, options: string[]): AvgChoiceNode {
  return {
    id,
    type: 'choice',
    line,
    raw,
    options,
  }
}

function createNameCueNode(id: string, line: number, raw: string, speaker: string): AvgCueNode {
  return {
    id,
    type: 'cue',
    line,
    raw,
    cue: `name="${speaker}"`,
    args: '',
  }
}

function createDialogueNode(
  id: string,
  line: number,
  raw: string,
  speaker: string,
  text: string
): AvgDialogueNode {
  return {
    id,
    type: 'dialogue',
    line,
    raw,
    speaker,
    text,
  }
}

function createNarrationNode(
  id: string,
  line: number,
  raw: string,
  text: string
): AvgNarrationNode {
  return {
    id,
    type: 'narration',
    line,
    raw,
    text,
  }
}

function createUnknownCueNode(
  id: string,
  line: number,
  raw: string,
  prop: string | undefined,
  attributes: Record<string, unknown> | null
): UnknownCueBlock {
  return {
    id,
    type: 'unknownCue',
    line,
    raw,
    prop: prop ?? 'unknown',
    attributes: toUnknownCueAttributes(attributes),
  }
}

function toUnknownCueAttributes(
  attributes: Record<string, unknown> | null
): Record<string, string> {
  if (!attributes) {
    return {}
  }

  const normalized: Record<string, string> = {}

  for (const [key, value] of Object.entries(attributes)) {
    const text = toTrimmedString(value)

    if (text) {
      normalized[key] = text
      continue
    }

    try {
      normalized[key] = JSON.stringify(value)
    } catch {
      normalized[key] = '[unserializable]'
    }
  }

  return normalized
}
