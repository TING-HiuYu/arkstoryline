import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { StorylineOverride } from '../../src/domain/timeline/storyline-order-service'

export interface StorylineOverridesConfig {
  version: number
  overrides: StorylineOverride[]
}

export const DEFAULT_STORYLINE_OVERRIDES_PATH = resolve(
  process.cwd(),
  'contents/storyline-overrides.json'
)

export async function readStorylineOverrides(
  filePath: string = DEFAULT_STORYLINE_OVERRIDES_PATH
): Promise<StorylineOverridesConfig> {
  const text = await readFile(filePath, 'utf8')

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(
      `[storyline-overrides] Failed to parse JSON at "${filePath}": ${getErrorMessage(error)}`,
      { cause: error }
    )
  }

  return parseStorylineOverridesConfig(parsed)
}

export function parseStorylineOverridesConfig(input: unknown): StorylineOverridesConfig {
  if (!isRecord(input)) {
    throw new Error('[storyline-overrides] Expected root object.')
  }

  const version = expectPositiveInteger(input.version, 'version')
  const overrides = expectOverrides(input.overrides, 'overrides')

  return {
    version,
    overrides,
  }
}

function expectOverrides(value: unknown, path: string): StorylineOverride[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `[storyline-overrides] Expected "${path}" to be an array, got ${getValueType(value)}.`
    )
  }

  return value.map((entry, index) => parseOverride(entry, `${path}[${index}]`))
}

function parseOverride(value: unknown, path: string): StorylineOverride {
  if (!isRecord(value)) {
    throw new Error(
      `[storyline-overrides] Expected "${path}" to be an object, got ${getValueType(value)}.`
    )
  }

  const albumId = expectNonEmptyString(value.albumId, `${path}.albumId`)
  const section = expectHomeSection(value.section, `${path}.section`)
  const reason = expectNonEmptyString(value.reason, `${path}.reason`)
  const timelineRank = expectOptionalFiniteNumber(value.timelineRank, `${path}.timelineRank`)
  const gameOrderRank = expectOptionalFiniteNumber(value.gameOrderRank, `${path}.gameOrderRank`)

  return {
    albumId,
    section,
    reason,
    timelineRank,
    gameOrderRank,
  }
}

function expectHomeSection(value: unknown, path: string): StorylineOverride['section'] {
  if (value === 'mainline' || value === 'sideStory' || value === 'operatorRecord') {
    return value
  }

  throw new Error(
    `[storyline-overrides] Expected "${path}" to be one of mainline | sideStory | operatorRecord, got ${getValueType(value)}.`
  )
}

function expectOptionalFiniteNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `[storyline-overrides] Expected "${path}" to be a finite number, got ${getValueType(value)}.`
    )
  }

  return value
}

function expectPositiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      `[storyline-overrides] Expected "${path}" to be a positive integer, got ${getValueType(value)}.`
    )
  }

  return value
}

function expectNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `[storyline-overrides] Expected "${path}" to be a non-empty string, got ${getValueType(value)}.`
    )
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getValueType(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  return typeof value
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
