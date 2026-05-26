import type { DataSourceProvider, SourceRevision } from './data-source-provider'

type CommitShaPolicy = 'any' | 'git'

export interface ResolveSourceRevisionOptions {
  commitShaPolicy?: CommitShaPolicy
}

const DEFAULT_OPTIONS: Required<ResolveSourceRevisionOptions> = {
  commitShaPolicy: 'any',
}

export async function resolveSourceRevision(
  source: DataSourceProvider,
  options: ResolveSourceRevisionOptions = DEFAULT_OPTIONS
): Promise<SourceRevision> {
  const policy = options.commitShaPolicy ?? DEFAULT_OPTIONS.commitShaPolicy

  let revision: SourceRevision
  try {
    revision = await source.getRevision()
  } catch (error) {
    throw new Error(
      `[SourceRevision] Failed to resolve revision from provider "${source.id}": ${getErrorMessage(error)}`,
      { cause: error }
    )
  }

  const providerId = revision.providerId.trim()
  if (providerId.length === 0) {
    throw new Error(`[SourceRevision] Provider "${source.id}" returned empty "providerId"`)
  }

  const commitSha = revision.commitSha.trim()
  if (commitSha.length === 0) {
    throw new Error(`[SourceRevision] Provider "${source.id}" returned empty "commitSha"`)
  }

  if (policy === 'git' && !isGitCommitSha(commitSha)) {
    throw new Error(
      `[SourceRevision] Provider "${source.id}" returned non-git commit sha: "${commitSha}"`
    )
  }

  return {
    ...revision,
    providerId,
    commitSha,
  }
}

export async function resolveRemoteSourceRevision(
  source: DataSourceProvider
): Promise<SourceRevision> {
  return resolveSourceRevision(source, {
    commitShaPolicy: 'git',
  })
}

function isGitCommitSha(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
