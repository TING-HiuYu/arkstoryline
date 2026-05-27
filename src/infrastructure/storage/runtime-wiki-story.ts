import { normalizeTrustedMediaUrl } from './trusted-media-url'

export interface RuntimeWikiStoryPage {
  page: string
  sourceUrl: string
  title: string
  textlog: string
  resources: Record<string, string>
  blocks: RuntimeWikiStoryBlock[]
}

export type RuntimeWikiStoryBlock =
  | {
      type: 'dialogue'
      id: string
      speaker: string
      text: string
    }
  | {
      type: 'narration'
      id: string
      text: string
    }
  | {
      type: 'image'
      id: string
      sourceId: string
      url?: string
      role: 'background' | 'image'
    }
  | {
      type: 'divider'
      id: string
    }

interface WikiParseApiResponse {
  parse?: {
    title?: string
    text?: {
      '*'?: string
    }
  }
  error?: {
    info?: string
  }
}

const WIKI_API_URL = 'https://m.prts.wiki/api.php'
const DEFAULT_SOURCE_URL_PREFIX = 'https://prts.wiki/w/'
const INLINE_DIALOGUE_RE = /^\[(?:name|speaker)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]]+))\](.*)$/i
const COMMAND_RE = /\[([A-Za-z_][A-Za-z0-9_]*)(?:\(([^[]*?)\))?\]/gi
const COMMAND_LINE_RE = /^\[([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?\]\s*$/i
const COMMAND_ARG_RE = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\s)]+))/g

export async function loadRuntimeWikiStoryPage(
  pageOrUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<RuntimeWikiStoryPage> {
  const page = normalizeWikiPageTitle(pageOrUrl)
  const html = await fetchParsedWikiHtml(page, fetchImpl)
  const { textlog, resources } = extractRuntimeStoryPayload(html)

  if (!textlog) {
    throw new Error(`没有在 ${page} 找到 datas_txt。`)
  }

  return {
    page,
    sourceUrl: `${DEFAULT_SOURCE_URL_PREFIX}${encodeWikiPageForUrl(page)}`,
    title: page.replace(/\/(BEG|END|NBT)$/i, ''),
    textlog,
    resources,
    blocks: parseRuntimeWikiTextlog(textlog, resources),
  }
}

export function normalizeWikiPageTitle(pageOrUrl: string): string {
  const trimmed = pageOrUrl.trim()

  if (trimmed.length === 0) {
    throw new Error('Runtime wiki page title cannot be empty.')
  }

  if (URL.canParse(trimmed)) {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'prts.wiki') {
      throw new Error(`Unsupported runtime wiki URL host: ${url.hostname}`)
    }

    const pathMatch = url.pathname.match(/\/w\/(.+)$/)
    if (pathMatch) {
      return decodeURIComponent(pathMatch[1])
    }
  }

  return trimmed
}

export function parseRuntimeWikiTextlog(
  textlog: string,
  resources: Record<string, string>
): RuntimeWikiStoryBlock[] {
  const blocks: RuntimeWikiStoryBlock[] = []
  let activeSpeaker: string | null = null
  let nextId = 1

  const pushText = (text: string) => {
    const normalizedText = text.trim()

    if (!normalizedText) {
      return
    }

    if (activeSpeaker) {
      blocks.push({
        type: 'dialogue',
        id: `dialogue-${nextId++}`,
        speaker: activeSpeaker,
        text: normalizedText,
      })
      return
    }

    blocks.push({
      type: 'narration',
      id: `narration-${nextId++}`,
      text: normalizedText,
    })
  }

  const pushCommand = (commandName: string, rawArgs?: string) => {
    const name = commandName.toLowerCase()
    const args = parseCommandArgs(rawArgs ?? '')

    if (name === 'dialog') {
      blocks.push({ type: 'divider', id: `divider-${nextId++}` })
      return
    }

    if (name !== 'background' && name !== 'image') {
      return
    }

    const sourceId = args.image

    if (!sourceId) {
      return
    }

    const role = name === 'background' ? 'background' : 'image'
    blocks.push({
      type: 'image',
      id: `${role}-${nextId++}`,
      role,
      sourceId,
      url: resolveRuntimeResourceUrl(resources, sourceId, role),
    })
  }

  for (const rawLine of textlog.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line) {
      continue
    }

    const dialogueMatch = line.match(INLINE_DIALOGUE_RE)

    if (dialogueMatch) {
      activeSpeaker = normalizeSpeaker(
        dialogueMatch[1] ?? dialogueMatch[2] ?? dialogueMatch[3] ?? ''
      )
      pushText(stripCommands(dialogueMatch[4] ?? ''))
      continue
    }

    const commandLineMatch = line.match(COMMAND_LINE_RE)

    if (commandLineMatch) {
      pushCommand(commandLineMatch[1], commandLineMatch[2])
      continue
    }

    const commands = Array.from(line.matchAll(COMMAND_RE))

    if (commands.length > 0) {
      for (const command of commands) {
        pushCommand(command[1], command[2])
      }
    }

    pushText(stripCommands(line))
  }

  return blocks
}

async function fetchParsedWikiHtml(page: string, fetchImpl: typeof fetch): Promise<string> {
  const url = new URL(WIKI_API_URL)
  url.searchParams.set('action', 'parse')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('prop', 'text')
  url.searchParams.set('page', page)

  const response = await fetchImpl(url.toString())

  if (!response.ok) {
    throw new Error(`PRTS API 请求失败：${response.status}`)
  }

  const payload = (await response.json()) as WikiParseApiResponse

  if (payload.error) {
    throw new Error(payload.error.info ?? `PRTS API 无法解析 ${page}`)
  }

  const html = payload.parse?.text?.['*']

  if (!html) {
    throw new Error(`PRTS API 没有返回 ${page} 的正文 HTML。`)
  }

  return html
}

function extractRuntimeStoryPayload(html: string): {
  textlog: string
  resources: Record<string, string>
} {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const textlog = doc.querySelector('#datas_txt')?.textContent ?? ''
  const resourceText = doc.querySelector('#datas_back')?.textContent ?? ''

  return {
    textlog,
    resources: parseResourceText(resourceText),
  }
}

function parseResourceText(resourceText: string): Record<string, string> {
  const resources: Record<string, string> = {}

  for (const line of resourceText.split(/\r?\n/)) {
    const [rawId, rawUrl] = line.split(',')
    const id = rawId?.trim()
    const url = rawUrl?.trim()

    if (!id || !url) {
      continue
    }

    resources[toResourceKey(id)] = url
  }

  return resources
}

function resolveRuntimeResourceUrl(
  resources: Record<string, string>,
  sourceId: string,
  role: 'background' | 'image'
): string | undefined {
  const candidates =
    role === 'background'
      ? [sourceId, `bg_${sourceId}`, sourceId.replace(/^bg_/, '')]
      : [sourceId, sourceId.replace(/^avg_/, '')]

  for (const candidate of candidates) {
    const url = resources[toResourceKey(candidate)]

    if (url) {
      return normalizeTrustedMediaUrl(url)
    }
  }

  return undefined
}

function parseCommandArgs(rawArgs: string): Record<string, string> {
  const args: Record<string, string> = {}

  for (const match of rawArgs.matchAll(COMMAND_ARG_RE)) {
    const key = match[1].toLowerCase()
    args[key] = (match[2] ?? match[3] ?? match[4] ?? '').trim()
  }

  return args
}

function stripCommands(line: string): string {
  return line.replace(COMMAND_RE, '').trim()
}

function normalizeSpeaker(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '')
}

function toResourceKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.(png|jpe?g|webp)$/i, '')
}

function encodeWikiPageForUrl(page: string): string {
  return page
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}
