import {
  loadRuntimeWikiStoryPage,
  type RuntimeWikiStoryPage,
} from '../../../infrastructure/storage/runtime-wiki-story'

export type RuntimeStoryContent = RuntimeWikiStoryPage

export interface StoryResourceLoader {
  load(contentUrl: string): Promise<RuntimeStoryContent>
}

export class PrtsStoryResourceLoader implements StoryResourceLoader {
  public async load(contentUrl: string): Promise<RuntimeStoryContent> {
    return loadRuntimeWikiStoryPage(contentUrl)
  }
}
