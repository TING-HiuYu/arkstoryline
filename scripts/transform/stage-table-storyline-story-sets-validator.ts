interface StorylineStorySetsValidationOptions {
  sampleSize?: number
}

interface StorylineStorySetsValidationIssue {
  path: string
  expected: string
  actual: string
  message: string
}

interface StorylineStorySetSampleSummary {
  key: string
  storySetId: string | null
  storySetType: string | null
  sortByYear: number | null
  sortWithinYear: number | null
}

export interface StorylineStorySetsStructureValidationReport {
  valid: boolean
  totalStorylineStorySets: number
  sampleSize: number
  sampledStorySetCount: number
  sampledStorySets: StorylineStorySetSampleSummary[]
  storySetTypeDistribution: Record<string, number>
  coreRewardTypeDistribution: Record<string, number>
  issues: StorylineStorySetsValidationIssue[]
}

const DEFAULT_SAMPLE_SIZE = 8

export function validateStageTableStorylineStorySetsStructure(
  stageTable: unknown,
  options: StorylineStorySetsValidationOptions = {}
): StorylineStorySetsStructureValidationReport {
  const sampleSize = normalizeSampleSize(options.sampleSize, DEFAULT_SAMPLE_SIZE)
  const issues: StorylineStorySetsValidationIssue[] = []
  const sampledStorySets: StorylineStorySetSampleSummary[] = []
  const storySetTypeDistribution: Record<string, number> = {}
  const coreRewardTypeDistribution: Record<string, number> = {}

  if (!isRecord(stageTable)) {
    issues.push({
      path: 'stage_table',
      expected: 'object',
      actual: getValueType(stageTable),
      message: 'stage_table 根节点必须是对象。',
    })

    return buildReport({
      sampleSize,
      sampledStorySets,
      storySetTypeDistribution,
      coreRewardTypeDistribution,
      issues,
      totalStorylineStorySets: 0,
    })
  }

  const storylineStorySets = stageTable.storylineStorySets

  if (!isRecord(storylineStorySets)) {
    issues.push({
      path: 'stage_table.storylineStorySets',
      expected: 'object',
      actual: getValueType(storylineStorySets),
      message: 'stage_table.storylineStorySets 必须是对象。',
    })

    return buildReport({
      sampleSize,
      sampledStorySets,
      storySetTypeDistribution,
      coreRewardTypeDistribution,
      issues,
      totalStorylineStorySets: 0,
    })
  }

  const storySetEntries = Object.entries(storylineStorySets).sort(([left], [right]) =>
    left.localeCompare(right)
  )

  for (const [storySetKey, rawStorySet] of storySetEntries.slice(0, sampleSize)) {
    const storySetPath = `stage_table.storylineStorySets.${storySetKey}`

    if (!isRecord(rawStorySet)) {
      issues.push({
        path: storySetPath,
        expected: 'object',
        actual: getValueType(rawStorySet),
        message: 'storylineStorySet 节点必须是对象。',
      })

      sampledStorySets.push({
        key: storySetKey,
        storySetId: null,
        storySetType: null,
        sortByYear: null,
        sortWithinYear: null,
      })
      continue
    }

    const storySetId = expectString(rawStorySet.storySetId, `${storySetPath}.storySetId`, issues)
    const storySetType = expectString(
      rawStorySet.storySetType,
      `${storySetPath}.storySetType`,
      issues
    )
    const sortByYear = expectNumber(rawStorySet.sortByYear, `${storySetPath}.sortByYear`, issues)
    const sortWithinYear = expectNumber(
      rawStorySet.sortWithinYear,
      `${storySetPath}.sortWithinYear`,
      issues
    )

    expectString(rawStorySet.kvImageId, `${storySetPath}.kvImageId`, issues)
    expectString(rawStorySet.titleImageId, `${storySetPath}.titleImageId`, issues)
    expectBoolean(rawStorySet.haveVideoToPlay, `${storySetPath}.haveVideoToPlay`, issues)
    expectNullableString(rawStorySet.backgroundId, `${storySetPath}.backgroundId`, issues)
    expectString(rawStorySet.gameMusicId, `${storySetPath}.gameMusicId`, issues)

    const coreRewardType = expectString(
      rawStorySet.coreRewardType,
      `${storySetPath}.coreRewardType`,
      issues
    )
    expectNullableString(rawStorySet.coreRewardId, `${storySetPath}.coreRewardId`, issues)
    expectNullableString(
      rawStorySet.relevantActivityId,
      `${storySetPath}.relevantActivityId`,
      issues
    )

    validateMainlineData(rawStorySet.mainlineData, `${storySetPath}.mainlineData`, issues)
    validateSsData(rawStorySet.ssData, `${storySetPath}.ssData`, issues)
    validateCollectData(rawStorySet.collectData, `${storySetPath}.collectData`, issues)

    validateStorySetTypeNestedData(
      storySetType,
      rawStorySet.mainlineData,
      rawStorySet.ssData,
      rawStorySet.collectData,
      storySetPath,
      issues
    )

    if (storySetType !== null) {
      incrementDistribution(storySetTypeDistribution, storySetType)
    }

    if (coreRewardType !== null) {
      incrementDistribution(coreRewardTypeDistribution, coreRewardType)
    }

    sampledStorySets.push({
      key: storySetKey,
      storySetId,
      storySetType,
      sortByYear,
      sortWithinYear,
    })
  }

  return buildReport({
    sampleSize,
    sampledStorySets,
    storySetTypeDistribution,
    coreRewardTypeDistribution,
    issues,
    totalStorylineStorySets: storySetEntries.length,
  })
}

function validateMainlineData(
  mainlineData: unknown,
  path: string,
  issues: StorylineStorySetsValidationIssue[]
): void {
  if (mainlineData === null || mainlineData === undefined) {
    return
  }

  if (!isRecord(mainlineData)) {
    issues.push({
      path,
      expected: 'object | null',
      actual: getValueType(mainlineData),
      message: 'mainlineData 仅允许对象或 null。',
    })
    return
  }

  expectNullableString(mainlineData.zoneId, `${path}.zoneId`, issues)
  expectNullableString(mainlineData.retroId, `${path}.retroId`, issues)
  expectString(mainlineData.decoImageId, `${path}.decoImageId`, issues)
  expectString(mainlineData.desc, `${path}.desc`, issues)
  expectString(mainlineData.backgroundId, `${path}.backgroundId`, issues)
  expectStringArray(mainlineData.tags, `${path}.tags`, issues)
}

function validateSsData(
  ssData: unknown,
  path: string,
  issues: StorylineStorySetsValidationIssue[]
): void {
  if (ssData === null || ssData === undefined) {
    return
  }

  if (!isRecord(ssData)) {
    issues.push({
      path,
      expected: 'object | null',
      actual: getValueType(ssData),
      message: 'ssData 仅允许对象或 null。',
    })
    return
  }

  expectString(ssData.desc, `${path}.desc`, issues)
  expectString(ssData.backgroundId, `${path}.backgroundId`, issues)
  expectStringArray(ssData.tags, `${path}.tags`, issues)
  expectNullableString(ssData.reopenActivityId, `${path}.reopenActivityId`, issues)
  expectNullableString(ssData.retroActivityId, `${path}.retroActivityId`, issues)
  expectBoolean(ssData.isRecommended, `${path}.isRecommended`, issues)
  expectNullableString(ssData.recommendHideStageId, `${path}.recommendHideStageId`, issues)

  const overrideStageList = ssData.overrideStageList
  if (overrideStageList !== null && overrideStageList !== undefined) {
    expectStringArray(overrideStageList, `${path}.overrideStageList`, issues)
  }
}

function validateCollectData(
  collectData: unknown,
  path: string,
  issues: StorylineStorySetsValidationIssue[]
): void {
  if (collectData === null || collectData === undefined) {
    return
  }

  if (!isRecord(collectData)) {
    issues.push({
      path,
      expected: 'object | null',
      actual: getValueType(collectData),
      message: 'collectData 仅允许对象或 null。',
    })
    return
  }

  expectString(collectData.desc, `${path}.desc`, issues)
  expectString(collectData.backgroundId, `${path}.backgroundId`, issues)
}

function validateStorySetTypeNestedData(
  storySetType: string | null,
  mainlineData: unknown,
  ssData: unknown,
  collectData: unknown,
  path: string,
  issues: StorylineStorySetsValidationIssue[]
): void {
  if (storySetType === null) {
    return
  }

  if (storySetType === 'MAINLINE' && !isRecord(mainlineData)) {
    issues.push({
      path: `${path}.mainlineData`,
      expected: 'object',
      actual: getValueType(mainlineData),
      message: 'MAINLINE 类型必须提供 mainlineData 对象。',
    })
  }

  if (storySetType === 'SS' && !isRecord(ssData)) {
    issues.push({
      path: `${path}.ssData`,
      expected: 'object',
      actual: getValueType(ssData),
      message: 'SS 类型必须提供 ssData 对象。',
    })
  }

  if (storySetType === 'COLLECT' && !isRecord(collectData)) {
    issues.push({
      path: `${path}.collectData`,
      expected: 'object',
      actual: getValueType(collectData),
      message: 'COLLECT 类型必须提供 collectData 对象。',
    })
  }
}

function buildReport(input: {
  sampleSize: number
  sampledStorySets: StorylineStorySetSampleSummary[]
  storySetTypeDistribution: Record<string, number>
  coreRewardTypeDistribution: Record<string, number>
  issues: StorylineStorySetsValidationIssue[]
  totalStorylineStorySets: number
}): StorylineStorySetsStructureValidationReport {
  return {
    valid: input.issues.length === 0,
    totalStorylineStorySets: input.totalStorylineStorySets,
    sampleSize: input.sampleSize,
    sampledStorySetCount: input.sampledStorySets.length,
    sampledStorySets: input.sampledStorySets,
    storySetTypeDistribution: input.storySetTypeDistribution,
    coreRewardTypeDistribution: input.coreRewardTypeDistribution,
    issues: input.issues,
  }
}

function expectString(
  value: unknown,
  path: string,
  issues: StorylineStorySetsValidationIssue[]
): string | null {
  if (typeof value === 'string') {
    return value
  }

  issues.push({
    path,
    expected: 'string',
    actual: getValueType(value),
    message: '字段类型不符合预期。',
  })
  return null
}

function expectNullableString(
  value: unknown,
  path: string,
  issues: StorylineStorySetsValidationIssue[]
): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string') {
    return value
  }

  issues.push({
    path,
    expected: 'string | null',
    actual: getValueType(value),
    message: '字段类型不符合预期。',
  })
  return null
}

function expectBoolean(
  value: unknown,
  path: string,
  issues: StorylineStorySetsValidationIssue[]
): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  issues.push({
    path,
    expected: 'boolean',
    actual: getValueType(value),
    message: '字段类型不符合预期。',
  })
  return null
}

function expectNumber(
  value: unknown,
  path: string,
  issues: StorylineStorySetsValidationIssue[]
): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  issues.push({
    path,
    expected: 'number',
    actual: getValueType(value),
    message: '字段类型不符合预期。',
  })
  return null
}

function expectStringArray(
  value: unknown,
  path: string,
  issues: StorylineStorySetsValidationIssue[]
): string[] | null {
  if (!Array.isArray(value)) {
    issues.push({
      path,
      expected: 'string[]',
      actual: getValueType(value),
      message: '字段类型不符合预期。',
    })
    return null
  }

  let valid = true

  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== 'string') {
      valid = false
      issues.push({
        path: `${path}[${index}]`,
        expected: 'string',
        actual: getValueType(value[index]),
        message: '数组元素类型不符合预期。',
      })
    }
  }

  if (!valid) {
    return null
  }

  return value
}

function normalizeSampleSize(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }

  if (!Number.isInteger(value) || value <= 0) {
    return fallback
  }

  return value
}

function incrementDistribution(distribution: Record<string, number>, key: string): void {
  const previous = distribution[key] ?? 0
  distribution[key] = previous + 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
