export type AvgNode =
  | AvgNarrationNode
  | AvgCueNode
  | UnknownCueBlock
  | AvgDialogueNode
  | AvgChoiceNode
  | AvgSectionBreakNode

interface AvgNodeBase {
  id: string
  line: number
  raw: string
}

export interface AvgNarrationNode extends AvgNodeBase {
  type: 'narration'
  text: string
}

export interface AvgCueNode extends AvgNodeBase {
  type: 'cue'
  cue: string
  args: string
}

export interface UnknownCueBlock extends AvgNodeBase {
  type: 'unknownCue'
  prop: string
  attributes: Record<string, string>
}

export interface AvgDialogueNode extends AvgNodeBase {
  type: 'dialogue'
  speaker: string
  text: string
}

export interface AvgChoiceNode extends AvgNodeBase {
  type: 'choice'
  options: string[]
}

export interface AvgSectionBreakNode extends AvgNodeBase {
  type: 'sectionBreak'
  variant: 'empty' | 'scene'
}

const CUE_LINE_PATTERN = /^\[(?<cue>[^\]]+)](?<args>.*)$/
const NAME_CUE_PATTERN =
  /^name\s*=\s*(?:"(?<quoted>[^"]*)"|'(?<singleQuoted>[^']*)'|(?<plain>.*))$/i
const SIMPLE_CHOICE_CUE_PATTERN = /^(?:选项|choice|decision)$/i
const DECISION_CUE_PATTERN = /^decision\s*(?:\((?<params>.*)\))?$/i
const DECISION_OPTIONS_PATTERN =
  /\boptions\s*=\s*(?:"(?<quoted>[^"]*)"|'(?<singleQuoted>[^']*)'|(?<plain>[^,)]+))/i
const CHOICE_SEPARATOR_PATTERN = /\s*(?:\/|\||;|；)\s*/
const SCENE_BREAK_CUE_PATTERN = /^dialog$/i

export function parseAvgScript(source: string): AvgNode[] {
  const normalizedSource = normalizeSource(source)

  if (normalizedSource.length === 0) {
    return []
  }

  const nodes: AvgNode[] = []
  const lines = normalizedSource.split('\n')
  let activeSpeaker: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? ''
    const line = index + 1
    const trimmedLine = rawLine.trim()

    if (trimmedLine.length === 0) {
      if (index === lines.length - 1) {
        continue
      }

      const previousNode = nodes[nodes.length - 1]

      if (previousNode?.type === 'sectionBreak' && previousNode.variant === 'empty') {
        continue
      }

      nodes.push({
        id: `line-${line}`,
        type: 'sectionBreak',
        line,
        raw: rawLine,
        variant: 'empty',
      })
      continue
    }

    const cueMatch = trimmedLine.match(CUE_LINE_PATTERN)

    if (cueMatch?.groups) {
      const cue = cueMatch.groups.cue?.trim()
      const args = cueMatch.groups.args?.trim() ?? ''

      if (cue) {
        const speakerState = parseSpeakerStateFromCue(cue)

        if (speakerState.matched) {
          activeSpeaker = speakerState.speaker

          if (args.length > 0) {
            if (speakerState.speaker) {
              nodes.push({
                id: `line-${line}`,
                type: 'dialogue',
                line,
                raw: rawLine,
                speaker: speakerState.speaker,
                text: args,
              })
            } else {
              nodes.push({
                id: `line-${line}`,
                type: 'narration',
                line,
                raw: rawLine,
                text: args,
              })
            }
            continue
          }
        }

        const options = parseChoiceOptionsFromCue(cue, args)

        if (options) {
          nodes.push({
            id: `line-${line}`,
            type: 'choice',
            line,
            raw: rawLine,
            options,
          })
          continue
        }

        if (isSceneBreakCue(cue)) {
          nodes.push({
            id: `line-${line}`,
            type: 'sectionBreak',
            line,
            raw: rawLine,
            variant: 'scene',
          })
          continue
        }

        if (!isKnownCue(cue)) {
          nodes.push({
            id: `line-${line}`,
            type: 'unknownCue',
            line,
            raw: rawLine,
            ...parseUnknownCue(cue, args),
          })
          continue
        }

        nodes.push({
          id: `line-${line}`,
          type: 'cue',
          line,
          raw: rawLine,
          cue,
          args,
        })
        continue
      }
    }

    if (activeSpeaker) {
      nodes.push({
        id: `line-${line}`,
        type: 'dialogue',
        line,
        raw: rawLine,
        speaker: activeSpeaker,
        text: trimmedLine,
      })
      continue
    }

    nodes.push({
      id: `line-${line}`,
      type: 'narration',
      line,
      raw: rawLine,
      text: trimmedLine,
    })
  }

  return nodes
}

function parseSpeakerStateFromCue(cue: string): { matched: boolean; speaker: string | null } {
  const nameCueMatch = cue.match(NAME_CUE_PATTERN)

  if (!nameCueMatch?.groups) {
    return {
      matched: false,
      speaker: null,
    }
  }

  const speaker =
    nameCueMatch.groups.quoted ??
    nameCueMatch.groups.singleQuoted ??
    nameCueMatch.groups.plain ??
    ''
  const trimmedSpeaker = speaker.trim()

  return {
    matched: true,
    speaker: trimmedSpeaker.length > 0 ? trimmedSpeaker : null,
  }
}

function parseChoiceOptionsFromCue(cue: string, args: string): string[] | null {
  const trimmedCue = cue.trim()

  if (SIMPLE_CHOICE_CUE_PATTERN.test(trimmedCue)) {
    const options = splitChoiceOptions(args)
    return options.length > 0 ? options : null
  }

  const decisionMatch = trimmedCue.match(DECISION_CUE_PATTERN)

  if (!decisionMatch) {
    return null
  }

  const params = decisionMatch.groups?.params?.trim() ?? ''
  const optionsFromParams = extractDecisionOptions(params)
  const options = splitChoiceOptions(optionsFromParams ?? args)

  return options.length > 0 ? options : null
}

function extractDecisionOptions(params: string): string | null {
  if (params.length === 0) {
    return null
  }

  const optionsMatch = params.match(DECISION_OPTIONS_PATTERN)

  if (!optionsMatch?.groups) {
    return null
  }

  const rawOptions =
    optionsMatch.groups.quoted ??
    optionsMatch.groups.singleQuoted ??
    optionsMatch.groups.plain ??
    ''
  const trimmedOptions = rawOptions.trim()

  return trimmedOptions.length > 0 ? trimmedOptions : null
}

function splitChoiceOptions(value: string): string[] {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return []
  }

  return trimmedValue
    .split(CHOICE_SEPARATOR_PATTERN)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function isSceneBreakCue(cue: string): boolean {
  return SCENE_BREAK_CUE_PATTERN.test(cue.trim())
}

function isKnownCue(cue: string): boolean {
  return NAME_CUE_PATTERN.test(cue.trim())
}

function parseUnknownCue(
  cue: string,
  args: string
): {
  prop: string
  attributes: Record<string, string>
} {
  const trimmedCue = cue.trim()
  const propMatch = trimmedCue.match(/^[^\s(=]+/)
  const prop = (propMatch?.[0] ?? 'unknown').trim()

  return {
    prop,
    attributes: {
      cue: trimmedCue,
      args,
    },
  }
}

function normalizeSource(source: string): string {
  return source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}
