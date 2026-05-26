import type { StoryBlock } from './story-block'

function toDialogueLine(block: Extract<StoryBlock, { type: 'dialogue' }>): string {
  const speaker = block.speaker.trim()
  const text = block.text.trim()

  if (!text) {
    return ''
  }

  return speaker ? `${speaker}：${text}` : text
}

function toNarrationLine(block: Extract<StoryBlock, { type: 'narration' }>): string {
  return block.text.trim()
}

function toChoiceLine(block: Extract<StoryBlock, { type: 'choice' }>): string {
  const options = block.options.map((option) => option.trim()).filter(Boolean)

  if (options.length === 0) {
    return ''
  }

  return `[选项] ${options.join(' / ')}`
}

function assertNever(value: never): never {
  throw new Error(`Unsupported story block type in buildPlainText: ${JSON.stringify(value)}`)
}

export function buildPlainText(blocks: StoryBlock[]): string {
  const lines: string[] = []

  for (const block of blocks) {
    switch (block.type) {
      case 'dialogue':
        lines.push(toDialogueLine(block))
        break
      case 'narration':
        lines.push(toNarrationLine(block))
        break
      case 'choice':
        lines.push(toChoiceLine(block))
        break
      case 'sectionBreak':
        lines.push('')
        break
      case 'imageCue':
      case 'unknownCue':
        break
      default:
        assertNever(block)
    }
  }

  return lines
    .filter((line, index, array) => {
      if (line !== '') {
        return true
      }

      const previousLine = array[index - 1]
      const nextLine = array[index + 1]
      return previousLine !== '' && nextLine !== undefined
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
