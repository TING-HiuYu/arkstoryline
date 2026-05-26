export type StoryBlock =
  | DialogueBlock
  | NarrationBlock
  | ChoiceBlock
  | SectionBreakBlock
  | ImageCueBlock
  | UnknownCueBlock

export interface DialogueBlock {
  type: 'dialogue'
  id: string
  speaker: string
  text: string
  figureArt?: string
}

export interface NarrationBlock {
  type: 'narration'
  id: string
  text: string
}

export interface ChoiceBlock {
  type: 'choice'
  id: string
  options: string[]
  values?: string[]
}

export interface SectionBreakBlock {
  type: 'sectionBreak'
  id: string
  variant: 'dialog' | 'empty' | 'scene'
}

export interface ImageCueBlock {
  type: 'imageCue'
  id: string
  imageId?: string
  alt?: string
}

export interface UnknownCueBlock {
  type: 'unknownCue'
  id: string
  prop: string
  attributes: Record<string, unknown>
}
