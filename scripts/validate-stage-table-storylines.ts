import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { validateStageTableStorylinesStructure } from './transform/stage-table-storylines-validator'

interface ValidateStorylinesCliOptions {
  inputPath: string
  sampleSize: number
  locationSampleSize: number
}

interface ParsedArgs {
  inputPath?: string
  sampleSize?: number
  locationSampleSize?: number
}

const DEFAULT_INPUT_PATH = 'contents/stage_table.json'
const DEFAULT_SAMPLE_SIZE = 5
const DEFAULT_LOCATION_SAMPLE_SIZE = 5

export async function runValidateStageTableStorylines(
  options: ValidateStorylinesCliOptions
): Promise<ReturnType<typeof validateStageTableStorylinesStructure>> {
  const text = await readFile(options.inputPath, 'utf8')
  const json = JSON.parse(text) as unknown

  return validateStageTableStorylinesStructure(json, {
    sampleSize: options.sampleSize,
    locationSampleSize: options.locationSampleSize,
  })
}

export function parseValidateStageTableStorylinesArgs(
  argv: readonly string[]
): ValidateStorylinesCliOptions {
  const parsed = parseArgs(argv)

  return {
    inputPath: parsed.inputPath ?? DEFAULT_INPUT_PATH,
    sampleSize: parsed.sampleSize ?? DEFAULT_SAMPLE_SIZE,
    locationSampleSize: parsed.locationSampleSize ?? DEFAULT_LOCATION_SAMPLE_SIZE,
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--input') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('[data:validate:storylines] Missing value for "--input".')
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
        throw new Error('[data:validate:storylines] Missing value for "--sample-size".')
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

    if (token === '--location-sample-size') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('[data:validate:storylines] Missing value for "--location-sample-size".')
      }

      parsed.locationSampleSize = parsePositiveInteger(value, '--location-sample-size')
      index += 1
      continue
    }

    if (token.startsWith('--location-sample-size=')) {
      parsed.locationSampleSize = parsePositiveInteger(
        token.slice('--location-sample-size='.length),
        '--location-sample-size'
      )
      continue
    }

    throw new Error(`[data:validate:storylines] Unknown argument: "${token}".`)
  }

  return parsed
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `[data:validate:storylines] "${option}" must be a positive integer, got "${value}".`
    )
  }

  return parsed
}

async function main(): Promise<void> {
  const options = parseValidateStageTableStorylinesArgs(process.argv.slice(2))
  const resolvedInputPath = resolve(options.inputPath)
  const report = await runValidateStageTableStorylines({
    ...options,
    inputPath: resolvedInputPath,
  })

  console.log(
    JSON.stringify(
      {
        commandStatus: report.valid ? 'ok' : 'failed',
        command: 'data:validate:storylines',
        inputPath: options.inputPath,
        ...report,
      },
      null,
      2
    )
  )

  if (!report.valid) {
    console.error(
      `[data:validate:storylines] validation failed with ${report.issues.length} issue(s).`
    )
    process.exitCode = 1
  }
}

if (isExecutedAsEntry(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[data:validate:storylines] ${message}`)
    process.exitCode = 1
  })
}

function isExecutedAsEntry(moduleUrl: string, argvPath: string | undefined): boolean {
  if (argvPath === undefined) {
    return false
  }

  return moduleUrl === pathToFileURL(resolve(argvPath)).href
}
