export interface SearchTuning {
  threshold: number
  minMatchCharLength: number
  fieldWeights: {
    displayTitle: number
    albumTitle: number
    chapterTitle: number
    stageId: number
    stageCode: number
    aliases: number
    exactIds: number
  }
}

export const DEFAULT_SEARCH_TUNING: SearchTuning = {
  threshold: 0.42,
  minMatchCharLength: 1,
  fieldWeights: {
    displayTitle: 0.38,
    albumTitle: 0.28,
    chapterTitle: 0.24,
    stageId: 0.26,
    stageCode: 0.22,
    aliases: 0.44,
    exactIds: 0.64,
  },
}

export function resolveSearchTuning(input?: Partial<SearchTuning>): SearchTuning {
  if (!input) {
    return DEFAULT_SEARCH_TUNING
  }

  return {
    threshold:
      typeof input.threshold === 'number' && Number.isFinite(input.threshold)
        ? Math.min(Math.max(input.threshold, 0), 1)
        : DEFAULT_SEARCH_TUNING.threshold,
    minMatchCharLength:
      typeof input.minMatchCharLength === 'number' && Number.isInteger(input.minMatchCharLength)
        ? Math.max(1, input.minMatchCharLength)
        : DEFAULT_SEARCH_TUNING.minMatchCharLength,
    fieldWeights: {
      displayTitle:
        input.fieldWeights?.displayTitle ?? DEFAULT_SEARCH_TUNING.fieldWeights.displayTitle,
      albumTitle: input.fieldWeights?.albumTitle ?? DEFAULT_SEARCH_TUNING.fieldWeights.albumTitle,
      chapterTitle:
        input.fieldWeights?.chapterTitle ?? DEFAULT_SEARCH_TUNING.fieldWeights.chapterTitle,
      stageId: input.fieldWeights?.stageId ?? DEFAULT_SEARCH_TUNING.fieldWeights.stageId,
      stageCode: input.fieldWeights?.stageCode ?? DEFAULT_SEARCH_TUNING.fieldWeights.stageCode,
      aliases: input.fieldWeights?.aliases ?? DEFAULT_SEARCH_TUNING.fieldWeights.aliases,
      exactIds: input.fieldWeights?.exactIds ?? DEFAULT_SEARCH_TUNING.fieldWeights.exactIds,
    },
  }
}
