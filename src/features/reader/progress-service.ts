import type { ReadingProgress, AlbumProgress } from '../../domain/progress/reading-progress'
import { useReadingProgressStore } from '../../infrastructure/storage/use-reading-progress-store'

export class ProgressService {
  public save(progress: AlbumProgress): void {
    useReadingProgressStore.getState().updateProgress({
      albumId: progress.albumId,
      chapterId: progress.chapterId,
      progressPercent: progress.progressPercent,
      blockId: progress.reading.blockId,
      scrollRatio: progress.reading.scrollRatio,
      updatedAt: progress.reading.updatedAt,
    })
  }

  public clearAlbum(albumId: string): void {
    useReadingProgressStore.getState().clearAlbumProgress(albumId)
  }

  public clearAll(): void {
    useReadingProgressStore.getState().clearAllProgress()
  }

  public getLastRead(): ReadingProgress | undefined {
    return useReadingProgressStore.getState().lastRead
  }
}
