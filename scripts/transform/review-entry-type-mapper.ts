import type { StoryEntryType } from '../../src/domain/catalog/story-album'

export function mapReviewEntryTypeToEntryType(
  rawEntryType: string | undefined
): StoryEntryType | undefined {
  if (rawEntryType === 'NONE') {
    return 'operatorRecord'
  }

  return undefined
}
