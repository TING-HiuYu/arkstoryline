import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ReadingProgress, AlbumProgress } from '../../domain/progress/reading-progress'
import { createArkStorylineProfileStorage } from './arkstoryline-profile-storage'

interface ReadingProgressState {
  byAlbumId: Record<string, AlbumProgress>
  lastRead?: ReadingProgress
  updateProgress: (record: {
    albumId: string
    chapterId: string
    progressPercent: number
    scrollRatio?: number
    blockId?: string
    updatedAt?: string
  }) => void
  clearAlbumProgress: (albumId: string) => void
  clearAllProgress: () => void
}

export const useReadingProgressStore = create<ReadingProgressState>()(
  persist(
    (set) => ({
      byAlbumId: {},
      lastRead: undefined,
      updateProgress: (record) => {
        const reading: ReadingProgress = {
          albumId: record.albumId,
          chapterId: record.chapterId,
          blockId: record.blockId,
          scrollRatio: record.scrollRatio,
          updatedAt: record.updatedAt ?? new Date().toISOString(),
        }

        const albumProgress: AlbumProgress = {
          albumId: record.albumId,
          chapterId: record.chapterId,
          progressPercent: record.progressPercent,
          reading,
        }

        set((state) => ({
          byAlbumId: {
            ...state.byAlbumId,
            [record.albumId]: albumProgress,
          },
          lastRead: reading,
        }))
      },
      clearAlbumProgress: (albumId) => {
        set((state) => {
          const nextByAlbumId = { ...state.byAlbumId }

          delete nextByAlbumId[albumId]

          return {
            byAlbumId: nextByAlbumId,
            lastRead: state.lastRead?.albumId === albumId ? undefined : state.lastRead,
          }
        })
      },
      clearAllProgress: () => {
        set({
          byAlbumId: {},
          lastRead: undefined,
        })
      },
    }),
    {
      name: 'arkstoryline-reading-progress',
      storage: createArkStorylineProfileStorage('readingProgress'),
      partialize: (state) => ({
        byAlbumId: state.byAlbumId,
        lastRead: state.lastRead,
      }),
    }
  )
)
