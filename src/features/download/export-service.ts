import { buildExportDocument } from '../../domain/export/build-export-document'
import type { ExportFormat } from '../../domain/export/export-format'
import type { ExportSelection } from '../../domain/export/export-selection'
import type { ExportArtifact, ExportRenderer } from '../../domain/export/export-renderer'
import { StaticStoryRepository } from '../../infrastructure/storage/static-story-repository'
import type { StoryRepository } from '../../infrastructure/storage/static-story-repository'
import { EpubExportRenderer } from './epub-export-renderer'
import { PdfExportRenderer } from './pdf-export-renderer'
import { TxtExportRenderer } from './txt-export-renderer'

interface ExportServiceOptions {
  workerThreshold?: number
  workerFactory?: () => Worker
}

export interface ExportProgress {
  completedChapters: number
  totalChapters: number
  phase: 'fetching' | 'generating'
}

export interface ExportRunOptions {
  onProgress?: (progress: ExportProgress) => void
}

const DEFAULT_WORKER_THRESHOLD = 40

export class ExportService {
  private readonly repository: StoryRepository
  private readonly workerThreshold: number
  private readonly workerFactory?: () => Worker
  private readonly renderers: Record<ExportFormat, ExportRenderer>

  public constructor(
    repository: StoryRepository = new StaticStoryRepository(),
    options: ExportServiceOptions = {}
  ) {
    this.repository = repository
    this.workerThreshold = options.workerThreshold ?? DEFAULT_WORKER_THRESHOLD
    this.workerFactory = options.workerFactory
    this.renderers = {
      txt: new TxtExportRenderer(),
      epub: new EpubExportRenderer(),
      pdf: new PdfExportRenderer(),
    }
  }

  public async export(
    format: ExportFormat,
    selection: ExportSelection,
    runOptions: ExportRunOptions = {}
  ): Promise<ExportArtifact[]> {
    if (selection.items.length === 0) {
      throw new Error('导出项不能为空。')
    }

    if (!runOptions.onProgress && this.shouldUseWorker(format, selection)) {
      return this.exportByWorker(format, selection)
    }

    const document = await buildExportDocument(this.repository, selection, {
      onChapterExported: (progress) =>
        runOptions.onProgress?.({
          ...progress,
          phase: 'fetching',
        }),
    })
    const renderer = this.renderers[format]
    const totalChapters = selection.items.reduce((total, item) => total + item.chapterIds.length, 0)
    runOptions.onProgress?.({
      completedChapters: totalChapters,
      totalChapters,
      phase: 'generating',
    })

    return renderer.render({
      document,
      selection,
      includeImages: Boolean(selection.includeImages),
    })
  }

  private shouldUseWorker(format: ExportFormat, selection: ExportSelection): boolean {
    const chapterCount = selection.items.reduce((total, item) => total + item.chapterIds.length, 0)
    const includesOperatorContent = selection.items.some((item) => item.kind === 'operator')

    return (
      format === 'txt' &&
      chapterCount >= this.workerThreshold &&
      typeof Worker !== 'undefined' &&
      !includesOperatorContent
    )
  }

  private async exportByWorker(
    format: ExportFormat,
    selection: ExportSelection
  ): Promise<ExportArtifact[]> {
    const createWorker =
      this.workerFactory ??
      (() => new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' }))

    const worker = createWorker()

    try {
      return await new Promise<ExportArtifact[]>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent) => {
          const payload = event.data as
            | { error: string }
            | {
                artifacts: Array<{ fileName: string; mimeType: string; data: ArrayBuffer }>
              }

          if ('error' in payload) {
            reject(new Error(payload.error))
            return
          }

          resolve(
            payload.artifacts.map((artifact) => ({
              fileName: artifact.fileName,
              mimeType: artifact.mimeType,
              data: new Uint8Array(artifact.data),
            }))
          )
        }

        worker.onerror = (event) => {
          reject(new Error(event.message))
        }

        worker.postMessage({ format, selection })
      })
    } finally {
      worker.terminate()
    }
  }
}
