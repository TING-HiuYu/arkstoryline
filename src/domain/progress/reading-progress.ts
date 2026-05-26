export interface ReadingProgress {
  albumId: string
  chapterId: string
  blockId?: string
  scrollRatio?: number
  updatedAt: string
}

export interface AlbumProgress {
  albumId: string
  chapterId: string
  progressPercent: number
  reading: ReadingProgress
}

export interface ProgressStore {
  byAlbumId: Record<string, AlbumProgress>
  lastRead?: ReadingProgress
}
