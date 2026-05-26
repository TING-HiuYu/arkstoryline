/// <reference lib="webworker" />

import { buildExportDocument } from '../../domain/export/build-export-document'
import type { ExportSelection } from '../../domain/export/export-selection'
import { StaticStoryRepository } from '../../infrastructure/storage/static-story-repository'
import { TxtExportRenderer } from './txt-export-renderer'

interface WorkerExportRequest {
  format: 'txt'
  selection: ExportSelection
}

interface WorkerExportResponse {
  artifacts: Array<{ fileName: string; mimeType: string; data: ArrayBufferLike }>
}

const context: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

context.onmessage = async (event: MessageEvent<WorkerExportRequest>) => {
  try {
    if (event.data.format !== 'txt') {
      throw new Error('Worker 仅支持 TXT 导出。')
    }

    const repository = new StaticStoryRepository()
    const document = await buildExportDocument(repository, event.data.selection)
    const renderer = new TxtExportRenderer()
    const artifacts = await renderer.render({
      document,
      selection: event.data.selection,
      includeImages: false,
    })

    const payload: WorkerExportResponse = {
      artifacts: artifacts.map((artifact) => ({
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        data: artifact.data.buffer,
      })),
    }

    context.postMessage(
      payload,
      payload.artifacts.map((item) => item.data)
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    context.postMessage({ error: message })
  }
}
