export interface SourceFile {
  path: string
  sha?: string
  size?: number
  updatedAt?: string
}

export interface SourceRevision {
  providerId: string
  commitSha: string
  committedAt?: string
}

export interface DataSourceProvider {
  readonly id: string
  readonly label: string
  getText(path: string): Promise<string>
  getJson<T>(path: string): Promise<T>
  listFiles?(prefix: string): Promise<SourceFile[]>
  getRevision(): Promise<SourceRevision>
}

export type SourceAdapter = DataSourceProvider
