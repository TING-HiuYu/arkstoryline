export function calculateAlbumProgressPercent(input: {
  chapterIds: string[]
  currentChapterId: string
}): number {
  const chapterCount = input.chapterIds.length

  if (chapterCount === 0) {
    return 0
  }

  const chapterIndex = input.chapterIds.indexOf(input.currentChapterId)

  if (chapterIndex < 0) {
    return 0
  }

  const progress = ((chapterIndex + 1) / chapterCount) * 100

  return Math.min(100, Math.max(0, Math.round(progress)))
}
