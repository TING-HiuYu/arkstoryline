import { afterEach, describe, expect, it } from 'vitest'
import {
  ARKSTORYLINE_PROFILE_STORAGE_KEY,
  createArkStorylineProfileStorage,
} from './arkstoryline-profile-storage'

describe('arkstoryline profile storage', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('stores app settings and reading progress in one profile json', () => {
    const settingsStorage = createArkStorylineProfileStorage<{
      doctorName: string
    }>('appSettings')
    const progressStorage = createArkStorylineProfileStorage<{
      byAlbumId: Record<string, unknown>
      lastRead: { albumId: string; chapterId: string }
    }>('readingProgress')

    settingsStorage.setItem('arkstoryline-app-settings', {
      state: { doctorName: '博士' },
      version: 0,
    })
    progressStorage.setItem('arkstoryline-reading-progress', {
      state: {
        byAlbumId: {
          album_a: {
            albumId: 'album_a',
            chapterId: 'chapter_1',
            progressPercent: 42,
          },
        },
        lastRead: { albumId: 'album_a', chapterId: 'chapter_1' },
      },
      version: 0,
    })

    expect(localStorage.getItem('arkstoryline-app-settings')).toBeNull()
    expect(localStorage.getItem('arkstoryline-reading-progress')).toBeNull()

    const profile = JSON.parse(localStorage.getItem(ARKSTORYLINE_PROFILE_STORAGE_KEY) ?? '{}') as {
      appSettings?: { state?: { doctorName?: string } }
      readingProgress?: {
        state?: {
          byAlbumId?: Record<string, unknown>
          lastRead?: { albumId: string; chapterId: string }
        }
      }
    }

    expect(profile.appSettings?.state?.doctorName).toBe('博士')
    expect(profile.readingProgress?.state?.lastRead).toEqual({
      albumId: 'album_a',
      chapterId: 'chapter_1',
    })
    expect(profile.readingProgress?.state?.byAlbumId?.album_a).toBeDefined()
  })
})
