export interface ReadableStoryBlocksResult<TBlock extends { type: string }> {
  blocks: TBlock[]
  hiddenUnknownCueCount: number
}

const LEGACY_BARE_CONTROL_CUE_RE =
  /^\[\s*(?:background|battle|blocker|camerashake|cameraeffect|character|charslot|delay|dialog|effect|fadein|fadeout|gridbg|header|image|largebgtween|playmusic|playsound|predicateend|shake|stopmusic|stopsound|subtitle|tween|video)\s*\]$/i

export function getReadableStoryBlocks<TBlock extends { type: string }>(
  input: readonly TBlock[]
): ReadableStoryBlocksResult<TBlock> {
  const blocks: TBlock[] = []
  let hiddenUnknownCueCount = 0

  for (const block of input) {
    if (block.type === 'unknownCue') {
      hiddenUnknownCueCount += 1
      continue
    }

    if (isLegacyBareControlCueText(block)) {
      hiddenUnknownCueCount += 1
      continue
    }

    blocks.push(block)
  }

  return {
    blocks,
    hiddenUnknownCueCount,
  }
}

function isLegacyBareControlCueText(block: { type: string; text?: unknown }): boolean {
  return typeof block.text === 'string' && LEGACY_BARE_CONTROL_CUE_RE.test(block.text.trim())
}
