import type { DataSourceProvider, SourceFile, SourceRevision } from './data-source-provider'

const DEFAULT_OWNER = 'Kengxxiao'
const DEFAULT_REPO = 'ArknightsGameData'
const DEFAULT_REF = 'master'
const DEFAULT_API_BASE_URL = 'https://api.github.com'
const DEFAULT_RAW_BASE_URL = 'https://raw.githubusercontent.com'

interface GitHubCommitResponse {
  sha?: unknown
  commit?: {
    committer?: {
      date?: unknown
    }
  }
}

interface GitHubTreeNode {
  path?: unknown
  mode?: unknown
  type?: unknown
  sha?: unknown
  size?: unknown
}

interface GitHubTreeResponse {
  tree?: unknown
}

export interface GitHubRawDataSourceOptions {
  owner?: string
  repo?: string
  ref?: string
  label?: string
  apiBaseUrl?: string
  rawBaseUrl?: string
  token?: string
  fetchImpl?: typeof fetch
}

export class GitHubRawDataSource implements DataSourceProvider {
  public readonly id = 'github-raw'
  public readonly label: string

  private readonly owner: string
  private readonly repo: string
  private readonly ref: string
  private readonly apiBaseUrl: string
  private readonly rawBaseUrl: string
  private readonly token?: string
  private readonly fetchImpl: typeof fetch
  private revisionPromise?: Promise<SourceRevision>

  public constructor(options: GitHubRawDataSourceOptions = {}) {
    this.owner = options.owner ?? DEFAULT_OWNER
    this.repo = options.repo ?? DEFAULT_REPO
    this.ref = options.ref ?? DEFAULT_REF
    this.apiBaseUrl = this.normalizeBaseUrl(options.apiBaseUrl ?? DEFAULT_API_BASE_URL)
    this.rawBaseUrl = this.normalizeBaseUrl(options.rawBaseUrl ?? DEFAULT_RAW_BASE_URL)
    this.token = options.token
    this.fetchImpl = options.fetchImpl ?? fetch
    this.label = options.label ?? `GitHub Raw Data Source (${this.owner}/${this.repo}@${this.ref})`
  }

  public async getText(path: string): Promise<string> {
    const normalizedPath = this.normalizePath(path)
    const url = this.buildRawUrl(normalizedPath)
    const response = await this.request(url, `read text at "${normalizedPath}"`)

    return response.text()
  }

  public async getJson<T>(path: string): Promise<T> {
    const normalizedPath = this.normalizePath(path)
    const text = await this.getText(normalizedPath)

    try {
      return JSON.parse(text) as T
    } catch (error) {
      throw new Error(
        `[GitHubRawDataSource] Invalid JSON at "${normalizedPath}": ${this.getErrorMessage(error)}`,
        { cause: error }
      )
    }
  }

  public async listFiles(prefix: string): Promise<SourceFile[]> {
    const normalizedPrefix = this.normalizePath(prefix)
    const revision = await this.getRevision()
    const url = `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/git/trees/${revision.commitSha}?recursive=1`
    const payload = await this.requestJson(url, 'list repository files')
    const tree = this.parseTree(payload)

    const files: SourceFile[] = tree
      .filter((item) => item.type === 'blob')
      .filter((item) => item.path.startsWith(normalizedPrefix))
      .map((item) => ({
        path: item.path,
        sha: item.sha,
        size: item.size,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))

    return files
  }

  public async getRevision(): Promise<SourceRevision> {
    if (!this.revisionPromise) {
      this.revisionPromise = this.loadRevision()
    }

    return this.revisionPromise
  }

  private async loadRevision(): Promise<SourceRevision> {
    const url = `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/commits/${encodeURIComponent(this.ref)}`
    const payload = await this.requestJson(url, `read revision for ref "${this.ref}"`)
    const commit = this.parseCommit(payload)

    return {
      providerId: this.id,
      commitSha: commit.sha,
      committedAt: commit.committedAt,
    }
  }

  private parseCommit(payload: unknown): {
    sha: string
    committedAt?: string
  } {
    if (!this.isRecord(payload)) {
      throw new Error('[GitHubRawDataSource] Invalid commit response: expected object payload')
    }

    const data = payload as GitHubCommitResponse
    if (typeof data.sha !== 'string' || data.sha.trim().length === 0) {
      throw new Error('[GitHubRawDataSource] Invalid commit response: missing "sha"')
    }

    const committedAt =
      typeof data.commit?.committer?.date === 'string' ? data.commit.committer.date : undefined

    return {
      sha: data.sha,
      committedAt,
    }
  }

  private parseTree(payload: unknown): Array<{
    path: string
    type: string
    sha?: string
    size?: number
  }> {
    if (!this.isRecord(payload)) {
      throw new Error('[GitHubRawDataSource] Invalid tree response: expected object payload')
    }

    const data = payload as GitHubTreeResponse
    if (!Array.isArray(data.tree)) {
      throw new Error('[GitHubRawDataSource] Invalid tree response: missing "tree" array')
    }

    return data.tree
      .filter((node): node is GitHubTreeNode => this.isRecord(node))
      .map((node) => {
        const path = typeof node.path === 'string' ? node.path : ''
        const type = typeof node.type === 'string' ? node.type : ''
        const sha = typeof node.sha === 'string' ? node.sha : undefined
        const size = typeof node.size === 'number' ? node.size : undefined

        return { path, type, sha, size }
      })
      .filter((node) => node.path.length > 0 && node.type.length > 0)
  }

  private buildRawUrl(path: string): string {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    const encodedRef = encodeURIComponent(this.ref)

    return `${this.rawBaseUrl}/${this.owner}/${this.repo}/${encodedRef}/${encodedPath}`
  }

  private async request(url: string, context: string): Promise<Response> {
    const response = await this.fetchImpl(url, {
      headers: this.createHeaders('application/json,text/plain,*/*'),
    })

    if (!response.ok) {
      throw new Error(
        `[GitHubRawDataSource] Failed to ${context}: HTTP ${response.status} ${response.statusText}`
      )
    }

    return response
  }

  private async requestJson(url: string, context: string): Promise<unknown> {
    const response = await this.request(url, context)

    try {
      return (await response.json()) as unknown
    } catch (error) {
      throw new Error(
        `[GitHubRawDataSource] Failed to decode JSON while trying to ${context}: ${this.getErrorMessage(error)}`,
        { cause: error }
      )
    }
  }

  private createHeaders(accept: string): Headers {
    const headers = new Headers({
      Accept: accept,
    })

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`)
    }

    return headers
  }

  private normalizePath(path: string): string {
    const normalized = path.trim().replace(/^\/+/, '')
    if (normalized.length === 0) {
      throw new Error('[GitHubRawDataSource] "path" must not be empty')
    }

    return normalized
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '')
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }

    return String(error)
  }
}
