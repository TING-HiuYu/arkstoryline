import { StaticStoryRepository } from '../../infrastructure/storage/static-story-repository'
import { SearchService } from './search-service'

let sharedFetchImpl: typeof fetch | null = null
let sharedSearchService: SearchService | null = null

export function getSharedSearchService(): SearchService {
  if (!sharedSearchService || sharedFetchImpl !== globalThis.fetch) {
    sharedFetchImpl = globalThis.fetch
    sharedSearchService = new SearchService(new StaticStoryRepository(sharedFetchImpl))
  }

  return sharedSearchService
}
