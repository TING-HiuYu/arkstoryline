import type { DataSourceProvider, SourceFile, SourceRevision } from './data-source-provider'

type FixtureValue = string | unknown

export interface LocalFixtureDataSourceOptions {
  revision?: string
  committedAt?: string
}

export class LocalFixtureDataSource implements DataSourceProvider {
  public readonly id = 'local-fixture'
  public readonly label = 'Local Fixture Data Source'

  private readonly fixtures: ReadonlyMap<string, FixtureValue>
  private readonly revision: SourceRevision

  public constructor(
    fixtures: Record<string, FixtureValue>,
    options: LocalFixtureDataSourceOptions = {}
  ) {
    this.fixtures = new Map(Object.entries(fixtures))
    this.revision = {
      providerId: this.id,
      commitSha: options.revision ?? 'local-fixture',
      committedAt: options.committedAt,
    }
  }

  public async getText(path: string): Promise<string> {
    const value = this.requireFixture(path)
    if (typeof value === 'string') {
      return value
    }

    try {
      return JSON.stringify(value)
    } catch (error) {
      throw new Error(
        `[LocalFixtureDataSource] Failed to serialize fixture at "${path}" as text: ${this.getErrorMessage(error)}`,
        { cause: error }
      )
    }
  }

  public async getJson<T>(path: string): Promise<T> {
    const value = this.requireFixture(path)
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T
      } catch (error) {
        throw new Error(
          `[LocalFixtureDataSource] Invalid JSON fixture at "${path}": ${this.getErrorMessage(error)}`,
          { cause: error }
        )
      }
    }

    return value as T
  }

  public async listFiles(prefix: string): Promise<SourceFile[]> {
    const normalizedPrefix = prefix.trim()
    const files: SourceFile[] = []

    for (const path of this.fixtures.keys()) {
      if (path.startsWith(normalizedPrefix)) {
        files.push({ path })
      }
    }

    return files.sort((a, b) => a.path.localeCompare(b.path))
  }

  public async getRevision(): Promise<SourceRevision> {
    return this.revision
  }

  private requireFixture(path: string): FixtureValue {
    const value = this.fixtures.get(path)
    if (value === undefined) {
      throw new Error(`[LocalFixtureDataSource] Fixture not found for path "${path}"`)
    }

    return value
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }

    return String(error)
  }
}
