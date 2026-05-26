import type { StoryEntryType } from '../../src/domain/catalog/story-album'

export function mapStorylineStorySetTypeToEntryType(
  storySetType: string | undefined
): StoryEntryType | undefined {
  if (storySetType === 'MAINLINE') {
    return 'mainline'
  }

  if (storySetType === 'SS') {
    return 'intermezzi'
  }

  if (storySetType === 'COLLECT') {
    return 'sideStory'
  }

  if (storySetType === 'NONE') {
    return 'operatorRecord'
  }

  return undefined
}
