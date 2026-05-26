import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { validateStageTableStorylineStorySetsStructure } from './transform/stage-table-storyline-story-sets-validator'

interface ValidateStorylineStorySetsCliOptions {
  inputPath: string
  sampleSize: number
}

interface ParsedArgs {
  inputPath?: string
  sampleSize?: number
}

const DEFAULT_INPUT_PATH = 'contents/stage_table.json'
const DEFAULT_SAMPLE_SIZE = 8

export async function runValidateStageTableStorylineStorySets(
  options: ValidateStorylineStorySetsCliOptions
): Promise<ReturnType<typeof validateStageTableStorylineStorySetsStructure>> {
  const text = await readFile(options.inputPath, 'utf8')
  const json = JSON.parse(text) as unknown

  return validateStageTableStorylineStorySetsStructure(json, {
    sampleSize: options.sampleSize,
  })
}

export function parseValidateStageTableStorylineStorySetsArgs(
  argv: readonly string[]
): ValidateStorylineStorySetsCliOptions {
  const parsed = parseArgs(argv)

  return {
    inputPath: parsed.inputPath ?? DEFAULT_INPUT_PATH,
    sampleSize: parsed.sampleSize ?? DEFAULT_SAMPLE_SIZE,
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--input') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('[data:validate:storyline-story-sets] Missing value for "--input".')
      }

      parsed.inputPath = value
      index += 1
      continue
    }

    if (token.startsWith('--input=')) {
      parsed.inputPath = token.slice('--input='.length)
      continue
    }

    if (token === '--sample-size') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('[data:validate:storyline-story-sets] Missing value for "--sample-size".')
      }

      parsed.sampleSize = parsePositiveInteger(value, '--sample-size')
      index += 1
      continue
    }

    if (token.startsWith('--sample-size=')) {
      parsed.sampleSize = parsePositiveInteger(
        token.slice('--sample-size='.length),
        '--sample-size'
      )
      continue
    }

    throw new Error(`[data:validate:storyline-story-sets] Unknown argument: "${token}".`)
  }

  return parsed
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `[data:validate:storyline-story-sets] "${option}" must be a positive integer, got "${value}".`
    )
  }

  return parsed
}

async function main(): Promise<void> {
  const options = parseValidateStageTableStorylineStorySetsArgs(process.argv.slice(2))
  const resolvedInputPath = resolve(options.inputPath)
  const report = await runValidateStageTableStorylineStorySets({
    ...options,
    inputPath: resolvedInputPath,
  })

  console.log(
    JSON.stringify(
      {
        commandStatus: report.valid ? 'ok' : 'failed',
        command: 'data:validate:storyline-story-sets',
        inputPath: options.inputPath,
        ...report,
      },
      null,
      2
    )
  )

  if (!report.valid) {
    console.error(
      `[data:validate:storyline-story-sets] validation failed with ${report.issues.length} issue(s).`
    )
    process.exitCode = 1
  }
}

if (isExecutedAsEntry(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[data:validate:storyline-story-sets] ${message}`)
    process.exitCode = 1
  })
}

function isExecutedAsEntry(moduleUrl: string, argvPath: string | undefined): boolean {
  if (argvPath === undefined) {
    return false
  }

  return moduleUrl === pathToFileURL(resolve(argvPath)).href
}
