import { describe, expect, it, vi } from 'vitest'
import { fetchRemoteSearchResults, sanitizeRemoteSearchTargetPath } from './search-remote'

describe('remote search target paths', () => {
  it('keeps only same-site paths', async () => {
    expect(sanitizeRemoteSearchTargetPath('/zh_CN/read/album/chapter')).toBe(
      '/zh_CN/read/album/chapter'
    )
    expect(sanitizeRemoteSearchTargetPath('https://evil.example/read')).toBeUndefined()
    expect(sanitizeRemoteSearchTargetPath('//evil.example/read')).toBeUndefined()
    expect(sanitizeRemoteSearchTargetPath('javascript:alert(1)')).toBeUndefined()
    expect(sanitizeRemoteSearchTargetPath('data:text/html,unsafe')).toBeUndefined()
    expect(sanitizeRemoteSearchTargetPath('/\\evil.example/read')).toBeUndefined()
  })

  it('removes unsafe target paths from remote search results before rendering', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          { id: 'safe', title: 'Safe', targetPath: '/zh_CN/albums/s1' },
          { id: 'unsafe', title: 'Unsafe', targetPath: 'https://evil.example/s1' },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const results = await fetchRemoteSearchResults('/api/search', 'zh_CN', 'amiya', {
      signal: controller.signal,
    })

    expect(results).toEqual([
      { id: 'safe', title: 'Safe', targetPath: '/zh_CN/albums/s1' },
      { id: 'unsafe', title: 'Unsafe', targetPath: undefined },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/search',
      expect.objectContaining({ signal: controller.signal })
    )

    vi.unstubAllGlobals()
  })
})
