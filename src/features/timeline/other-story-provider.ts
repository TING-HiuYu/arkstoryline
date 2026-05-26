import type { OtherStoryRef } from '../../domain/catalog/other-story-ref'

export interface OtherStoryProvider {
  getOtherStorys(albumId: string): OtherStoryRef[]
}

export class MemoryOtherStoryProvider implements OtherStoryProvider {
  private readonly byAlbumId: Record<string, OtherStoryRef[]>
  private readonly enabled: boolean

  public constructor(input: { byAlbumId: Record<string, OtherStoryRef[]>; enabled: boolean }) {
    this.byAlbumId = input.byAlbumId
    this.enabled = input.enabled
  }

  public getOtherStorys(albumId: string): OtherStoryRef[] {
    if (!this.enabled) {
      return []
    }

    return this.byAlbumId[albumId] ?? []
  }
}
