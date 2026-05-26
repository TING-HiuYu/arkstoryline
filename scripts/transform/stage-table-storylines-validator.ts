interface StorylinesValidationOptions {
  sampleSize?: number
  locationSampleSize?: number
}

interface StorylinesValidationIssue {
  path: string
  expected: string
  actual: string
  message: string
}

interface StorylineSampleSummary {
  key: string
  storylineId: string | null
  storylineType: string | null
  locationCount: number
}

export interface StorylinesStructureValidationReport {
  valid: boolean
  totalStorylines: number
  sampleSize: number
  locationSampleSize: number
  sampledStorylineCount: number
  sampledStorylines: StorylineSampleSummary[]
  storylineTypeDistribution: Record<string, number>
  locationTypeDistribution: Record<string, number>
  issues: StorylinesValidationIssue[]
}

const DEFAULT_SAMPLE_SIZE = 5
const DEFAULT_LOCATION_SAMPLE_SIZE = 5

export function validateStageTableStorylinesStructure(
  stageTable: unknown,
  options: StorylinesValidationOptions = {}
): StorylinesStructureValidationReport {
  const sampleSize = normalizeSampleSize(options.sampleSize, DEFAULT_SAMPLE_SIZE)
  const locationSampleSize = normalizeSampleSize(
    options.locationSampleSize,
    DEFAULT_LOCATION_SAMPLE_SIZE
  )

  const issues: StorylinesValidationIssue[] = []
  const sampledStorylines: StorylineSampleSummary[] = []
  const storylineTypeDistribution: Record<string, number> = {}
  const locationTypeDistribution: Record<string, number> = {}

  if (!isRecord(stageTable)) {
    issues.push({
      path: 'stage_table',
      expected: 'object',
      actual: getValueType(stageTable),
      message: 'stage_table 根节点必须是对象。',
    })

    return buildReport({
      sampleSize,
      locationSampleSize,
      sampledStorylines,
      storylineTypeDistribution,
      locationTypeDistribution,
      issues,
      totalStorylines: 0,
    })
  }

  const storylines = stageTable.storylines

  if (!isRecord(storylines)) {
    issues.push({
      path: 'stage_table.storylines',
      expected: 'object',
      actual: getValueType(storylines),
      message: 'stage_table.storylines 必须是对象。',
    })

    return buildReport({
      sampleSize,
      locationSampleSize,
      sampledStorylines,
      storylineTypeDistribution,
      locationTypeDistribution,
      issues,
      totalStorylines: 0,
    })
  }

  const storylineEntries = Object.entries(storylines).sort(([left], [right]) =>
    left.localeCompare(right)
  )
  const sampledEntries = storylineEntries.slice(0, sampleSize)

  for (const [storylineKey, rawStoryline] of sampledEntries) {
    const storylinePath = `stage_table.storylines.${storylineKey}`

    if (!isRecord(rawStoryline)) {
      issues.push({
        path: storylinePath,
        expected: 'object',
        actual: getValueType(rawStoryline),
        message: 'storyline 节点必须是对象。',
      })
      sampledStorylines.push({
        key: storylineKey,
        storylineId: null,
        storylineType: null,
        locationCount: 0,
      })
      continue
    }

    const storylineId = expectString(
      rawStoryline.storylineId,
      `${storylinePath}.storylineId`,
      issues
    )
    const storylineType = expectString(
      rawStoryline.storylineType,
      `${storylinePath}.storylineType`,
      issues
    )
    expectNumber(rawStoryline.sortId, `${storylinePath}.sortId`, issues)
    expectString(rawStoryline.storylineName, `${storylinePath}.storylineName`, issues)
    expectNullableString(rawStoryline.storylineIconId, `${storylinePath}.storylineIconId`, issues)
    expectNullableString(rawStoryline.storylineLogoId, `${storylinePath}.storylineLogoId`, issues)
    expectNullableString(rawStoryline.backgroundId, `${storylinePath}.backgroundId`, issues)
    expectBoolean(rawStoryline.hasVideoToPlay, `${storylinePath}.hasVideoToPlay`, issues)
    expectNumber(rawStoryline.startTs, `${storylinePath}.startTs`, issues)

    const locations = rawStoryline.locations
    let locationCount = 0

    if (!isRecord(locations)) {
      issues.push({
        path: `${storylinePath}.locations`,
        expected: 'object',
        actual: getValueType(locations),
        message: 'storyline.locations 必须是对象。',
      })
    } else {
      const locationEntries = Object.entries(locations).sort(([left], [right]) =>
        left.localeCompare(right)
      )
      locationCount = locationEntries.length

      for (const [locationKey, rawLocation] of locationEntries.slice(0, locationSampleSize)) {
        validateLocation(
          rawLocation,
          `${storylinePath}.locations.${locationKey}`,
          locationTypeDistribution,
          issues
        )
      }
    }

    if (storylineType !== null) {
      incrementDistribution(storylineTypeDistribution, storylineType)
    }

    sampledStorylines.push({
      key: storylineKey,
      storylineId,
      storylineType,
      locationCount,
    })
  }

  return buildReport({
    sampleSize,
    locationSampleSize,
    sampledStorylines,
    storylineTypeDistribution,
    locationTypeDistribution,
    issues,
    totalStorylines: storylineEntries.length,
  })
}

function validateLocation(
  location: unknown,
  path: string,
  locationTypeDistribution: Record<string, number>,
  issues: StorylinesValidationIssue[]
): void {
  if (!isRecord(location)) {
    issues.push({
      path,
      expected: 'object',
      actual: getValueType(location),
      message: 'location 节点必须是对象。',
    })
    return
  }

  expectString(location.locationId, `${path}.locationId`, issues)
  const locationType = expectString(location.locationType, `${path}.locationType`, issues)
  expectNumber(location.sortId, `${path}.sortId`, issues)
  expectNumber(location.startTime, `${path}.startTime`, issues)
  expectNullableString(location.presentStageId, `${path}.presentStageId`, issues)
  expectNullableString(location.unlockStageId, `${path}.unlockStageId`, issues)
  expectNullableString(location.relevantStorySetId, `${path}.relevantStorySetId`, issues)

  const splitDataPath = `${path}.mainlineSplitData`
  const mainlineSplitData = location.mainlineSplitData

  if (mainlineSplitData !== null && mainlineSplitData !== undefined) {
    if (!isRecord(mainlineSplitData)) {
      issues.push({
        path: splitDataPath,
        expected: 'object | null',
        actual: getValueType(mainlineSplitData),
        message: 'mainlineSplitData 仅允许对象或 null。',
      })
    } else {
      expectString(mainlineSplitData.iconId, `${splitDataPath}.iconId`, issues)
      expectString(mainlineSplitData.subName, `${splitDataPath}.subName`, issues)
    }
  }

  if (locationType !== null) {
    incrementDistribution(locationTypeDistribution, locationType)
  }
}

function buildReport(input: {
  sampleSize: number
  locationSampleSize: number
  sampledStorylines: StorylineSampleSummary[]
  storylineTypeDistribution: Record<string, number>
  locationTypeDistribution: Record<string, number>
  issues: StorylinesValidationIssue[]
  totalStorylines: number
}): StorylinesStructureValidationReport {
  return {
    valid: input.issues.length === 0,
    totalStorylines: input.totalStorylines,
    sampleSize: input.sampleSize,
    locationSampleSize: input.locationSampleSize,
    sampledStorylineCount: input.sampledStorylines.length,
    sampledStorylines: input.sampledStorylines,
    storylineTypeDistribution: input.storylineTypeDistribution,
    locationTypeDistribution: input.locationTypeDistribution,
    issues: input.issues,
  }
}

function expectString(
  value: unknown,
  path: string,
  issues: StorylinesValidationIssue[]
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
  issues: StorylinesValidationIssue[]
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
  issues: StorylinesValidationIssue[]
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
  issues: StorylinesValidationIssue[]
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
