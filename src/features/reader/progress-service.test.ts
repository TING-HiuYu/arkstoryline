import { describe, expect, it, beforeEach } from 'vitest'
import { ProgressService } from './progress-service'
import { useReadingProgressStore } from '../../infrastructure/storage/use-reading-progress-store'

describe('ProgressService', () => {
  const service = new ProgressService()

  beforeEach(() => {
    useReadingProgressStore.setState({
      byAlbumId: {},
      lastRead: undefined,
    })
  })

  it('saves and reads latest progress', () => {
    service.save({
      albumId: 'album_a',
      chapterId: 'chapter_1',
      progressPercent: 42,
      reading: {
        albumId: 'album_a',
        chapterId: 'chapter_1',
        scrollRatio: 0.42,
        updatedAt: '2026-05-10T12:00:00.000Z',
      },
    })

    const state = useReadingProgressStore.getState()

    expect(state.byAlbumId.album_a?.progressPercent).toBe(42)
    expect(service.getLastRead()).toEqual({
      albumId: 'album_a',
      chapterId: 'chapter_1',
      blockId: undefined,
      scrollRatio: 0.42,
      updatedAt: '2026-05-10T12:00:00.000Z',
    })
  })

  it('clears album and all progress', () => {
    service.save({
      albumId: 'album_a',
      chapterId: 'chapter_1',
      progressPercent: 60,
      reading: {
        albumId: 'album_a',
        chapterId: 'chapter_1',
        updatedAt: '2026-05-10T12:10:00.000Z',
      },
    })
    service.save({
      albumId: 'album_b',
      chapterId: 'chapter_2',
      progressPercent: 80,
      reading: {
        albumId: 'album_b',
        chapterId: 'chapter_2',
        updatedAt: '2026-05-10T12:20:00.000Z',
      },
    })

    service.clearAlbum('album_b')
    expect(useReadingProgressStore.getState().byAlbumId.album_b).toBeUndefined()

    service.clearAll()
    expect(useReadingProgressStore.getState().byAlbumId).toEqual({})
    expect(service.getLastRead()).toBeUndefined()
  })
})
