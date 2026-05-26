export interface ExportDocumentLine {
  text: string
  style: 'normal' | 'choiceSelected' | 'image'
  imageId?: string
}

export interface ExportDocumentImage {
  id: string
  alt: string
  sourcePath: string
}

export interface ExportDocumentChapter {
  albumId: string
  albumTitle: string
  chapterId: string
  chapterTitle: string
  chapterCode?: string
  content: string
  lines: ExportDocumentLine[]
  images?: ExportDocumentImage[]
  txtContent: string
}

export interface ExportDocumentAlbum {
  albumId: string
  albumTitle: string
  chapters: ExportDocumentChapter[]
}

export interface ExportDocument {
  locale: string
  generatedAt: string
  sourceRevision: string
  albums: ExportDocumentAlbum[]
  chapters: ExportDocumentChapter[]
}
