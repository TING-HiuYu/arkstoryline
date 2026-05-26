import type { DataSourceProvider, SourceFile, SourceRevision } from './data-source-provider'
import { GitHubRawDataSource, type GitHubRawDataSourceOptions } from './github-raw-data-source'

const DEFAULT_OWNER = '050644zf'
const DEFAULT_REPO = 'ArknightsStoryJson'
const DEFAULT_REF = 'main'

export interface StoryJsonDataSourceOptions extends Omit<
  GitHubRawDataSourceOptions,
  'owner' | 'repo' | 'label'
> {
  owner?: string
  repo?: string
  label?: string
}

export class StoryJsonDataSource implements DataSourceProvider {
  public readonly id = 'story-json'
  public readonly label: string

  private readonly source: DataSourceProvider

  public constructor(options: StoryJsonDataSourceOptions = {}) {
    const owner = options.owner ?? DEFAULT_OWNER
    const repo = options.repo ?? DEFAULT_REPO
    const ref = options.ref ?? DEFAULT_REF

    this.label = options.label ?? `Story JSON Data Source (${owner}/${repo}@${ref})`
    this.source = new GitHubRawDataSource({
      ...options,
      owner,
      repo,
      ref,
      label: this.label,
    })
  }

  public async getText(path: string): Promise<string> {
    return this.source.getText(path)
  }

  public async getJson<T>(path: string): Promise<T> {
    return this.source.getJson<T>(path)
  }

  public async listFiles(prefix: string): Promise<SourceFile[]> {
    if (!this.source.listFiles) {
      return []
    }

    return this.source.listFiles(prefix)
  }

  public async getRevision(): Promise<SourceRevision> {
    const revision = await this.source.getRevision()

    return {
      ...revision,
      providerId: this.id,
    }
  }
}
