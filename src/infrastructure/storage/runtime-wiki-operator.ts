import type {
  StaticOperatorArchiveData,
  StaticOperatorConfidentialData,
  StaticOperatorModulesData,
} from './static-story-repository'

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

export interface RuntimeWikiOperatorPage {
  archive: StaticOperatorArchiveData
  modules: StaticOperatorModulesData
  confidential: StaticOperatorConfidentialData
}

export interface RuntimeWikiOperatorExtras {
  modules: StaticOperatorModulesData
  confidential: StaticOperatorConfidentialData
}

const WIKI_API_URL = 'https://prts.wiki/api.php'
const DEFAULT_SOURCE_URL_PREFIX = 'https://prts.wiki/w/'

export async function loadRuntimeWikiOperatorPage(
  input: {
    operatorSlug: string
    operatorName: string
    page: string
  },
  fetchImpl: typeof fetch = fetch
): Promise<RuntimeWikiOperatorPage> {
  const html = await fetchParsedWikiHtml(input.page, fetchImpl)
  return parseRuntimeWikiOperatorHtml({
    html,
    operatorSlug: input.operatorSlug,
    operatorName: input.operatorName,
    page: input.page,
  })
}

export async function loadRuntimeWikiOperatorArchive(
  input: {
    operatorSlug: string
    operatorName: string
    page: string
  },
  fetchImpl: typeof fetch = fetch
): Promise<StaticOperatorArchiveData> {
  const html = await fetchParsedWikiHtml(input.page, fetchImpl)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  return parseOperatorArchiveSection(doc, input)
}

export async function loadRuntimeWikiOperatorExtras(
  input: {
    operatorSlug: string
    operatorName: string
    page: string
  },
  fetchImpl: typeof fetch = fetch
): Promise<RuntimeWikiOperatorExtras> {
  const html = await fetchParsedWikiHtml(input.page, fetchImpl)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  return {
    modules: parseOperatorModuleSection(doc, input),
    confidential: parseOperatorConfidentialSection(doc, input),
  }
}

export function parseRuntimeWikiOperatorHtml(input: {
  html: string
  operatorSlug: string
  operatorName: string
  page: string
}): RuntimeWikiOperatorPage {
  const doc = new DOMParser().parseFromString(input.html, 'text/html')
  return {
    archive: parseOperatorArchiveSection(doc, input),
    modules: parseOperatorModuleSection(doc, input),
    confidential: parseOperatorConfidentialSection(doc, input),
  }
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

function parseOperatorArchiveSection(
  doc: Document,
  input: { operatorSlug: string; operatorName: string; page: string }
): StaticOperatorArchiveData {
  const profile: Record<string, string> = {}
  const section = getHeadingSection(doc, '干员档案')
  let archiveIndex = 1
  let pendingTitle = ''
  let pendingCondition = ''

  for (const row of section.flatMap((node) => Array.from(node.querySelectorAll('tr')))) {
    const cell = row.querySelector('th, td')

    if (!cell) {
      continue
    }

    if (row.querySelector('td') && pendingTitle) {
      const body = htmlElementToText(row.querySelector('td')!)

      if (body) {
        const key = `档案${archiveIndex}`
        profile[key] = pendingTitle
        if (pendingCondition) {
          profile[`${key}条件`] = pendingCondition
        }
        profile[`${key}文本`] = body
        archiveIndex += 1
      }

      pendingTitle = ''
      pendingCondition = ''
      continue
    }

    const label = htmlElementToText(cell)

    if (!label || label.includes('人员档案')) {
      continue
    }

    if (cell.querySelector('small')) {
      pendingCondition = label
      continue
    }

    pendingTitle = label
    pendingCondition = ''
  }

  return {
    operatorId: input.operatorSlug,
    name: input.operatorName,
    profile,
    metadata: {
      source: 'runtime-prts-operator-page',
      sourceUrl: `${DEFAULT_SOURCE_URL_PREFIX}${encodeWikiPageForUrl(input.page)}`,
    },
  }
}

function parseOperatorModuleSection(
  doc: Document,
  input: { operatorSlug: string; operatorName: string }
): StaticOperatorModulesData {
  const modules: StaticOperatorModulesData['modules'] = []

  for (const moduleSection of getSubsections(doc, '模组', 'h3')) {
    const body = extractModuleBasicInfoText(moduleSection.nodes)

    if (!moduleSection.title) {
      continue
    }

    modules.push({
      id: `${input.operatorSlug}:module:${modules.length + 1}`,
      slug: slugifyModuleTitle(moduleSection.title),
      name: moduleSection.title,
      type: moduleSection.title,
      fields: body ? { 基础信息: body } : {},
    })
  }

  return {
    operatorId: input.operatorSlug,
    operatorName: input.operatorName,
    modules,
  }
}

function parseOperatorConfidentialSection(
  doc: Document,
  input: { operatorSlug: string; operatorName: string }
): StaticOperatorConfidentialData {
  const records: StaticOperatorConfidentialData['records'] = []
  const seenPages = new Set<string>()

  for (const node of getHeadingSection(doc, '干员密录')) {
    for (const link of Array.from(node.querySelectorAll<HTMLAnchorElement>('a'))) {
      const page = decodeWikiHref(link.getAttribute('href') ?? '')

      if (!page?.includes('/干员密录/') || seenPages.has(page)) {
        continue
      }

      seenPages.add(page)
      const title = inferConfidentialTitle(link) ?? `干员密录 ${records.length + 1}`

      records.push({
        id: `${input.operatorSlug}:confidential:${records.length + 1}`,
        slug: slugifyModuleTitle(title),
        title,
        page,
        contentSource: {
          provider: 'prts',
          url: `${DEFAULT_SOURCE_URL_PREFIX}${encodeWikiPageForUrl(page)}`,
          page,
          kind: 'operator-confidential',
        },
      })
    }
  }

  return {
    operatorId: input.operatorSlug,
    operatorName: input.operatorName,
    records,
  }
}

function getHeadingSection(doc: Document, headingId: string): Element[] {
  const heading = doc.getElementById(headingId)?.closest('h2')

  if (!heading) {
    return []
  }

  const section: Element[] = []
  let current = heading.nextElementSibling

  while (current && current.tagName.toLowerCase() !== 'h2') {
    section.push(current)
    current = current.nextElementSibling
  }

  return section
}

function getSubsections(
  doc: Document,
  parentHeadingId: string,
  childHeadingTag: 'h3'
): Array<{ title: string; nodes: Element[] }> {
  const sections: Array<{ title: string; nodes: Element[] }> = []
  let activeSection: { title: string; nodes: Element[] } | null = null

  for (const node of getHeadingSection(doc, parentHeadingId)) {
    if (node.tagName.toLowerCase() === childHeadingTag) {
      if (activeSection) {
        sections.push(activeSection)
      }
      activeSection = {
        title: htmlElementToText(node.querySelector('.mw-headline') ?? node),
        nodes: [],
      }
      continue
    }

    activeSection?.nodes.push(node)
  }

  if (activeSection) {
    sections.push(activeSection)
  }

  return sections
}

function extractModuleBasicInfoText(nodes: Element[]): string {
  const text = htmlElementsToText(nodes)
  const inlineBasicInfo = extractInlineModuleBasicInfoText(text)

  if (inlineBasicInfo) {
    return inlineBasicInfo
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const startIndex = lines.findIndex((line) => line === '基础信息')

  if (startIndex < 0) {
    return ''
  }

  const result: string[] = []

  for (const line of lines.slice(startIndex + 1)) {
    if (isModuleBasicInfoStopLine(line)) {
      break
    }

    result.push(line)
  }

  return normalizeDisplayText(result.join('\n'))
}

function extractInlineModuleBasicInfoText(text: string): string {
  const match = text.match(
    /基础信息\s*(?:全文阅读\s*)?([\s\S]*?)(?=(?:攻击\s*[+＋]|生命\s*[+＋]|防御\s*[+＋]|法术抗性\s*[+＋]|模组解锁任务|解锁需求与材料消耗|任务\d|$))/
  )

  return normalizeDisplayText(match?.[1] ?? '')
}

function isModuleBasicInfoStopLine(line: string): boolean {
  return (
    /^ORIGINAL$/i.test(line) ||
    /^STAGE\s*MAX$/i.test(line) ||
    /^任务\d*/.test(line) ||
    /^解锁条件/.test(line) ||
    /^升级材料/.test(line) ||
    /^属性/.test(line) ||
    /^特性/.test(line) ||
    /^天赋/.test(line) ||
    /^(生命|攻击|防御|法术抗性|再部署|部署费用|阻挡数|攻击速度)/.test(line)
  )
}

function inferConfidentialTitle(link: HTMLAnchorElement): string | undefined {
  const row = link.closest('tr') ?? link.parentElement

  if (!row) {
    return undefined
  }

  const labels = Array.from(row.querySelectorAll('b'))
    .map((node) => htmlElementToText(node))
    .filter((value) => value.length > 0 && !/^Lv\./i.test(value) && !/%$/.test(value))

  return labels[labels.length - 1]
}

function decodeWikiHref(href: string): string | undefined {
  const match = href.match(/\/w\/(.+)$/)

  if (!match) {
    return undefined
  }

  return decodeURIComponent(match[1].split('#', 1)[0] ?? '')
}

function htmlElementsToText(elements: Element[]): string {
  return normalizeDisplayText(elements.map((element) => htmlElementToText(element)).join('\n\n'))
}

function htmlElementToText(element: Element): string {
  const clone = element.cloneNode(true) as Element

  clone.querySelectorAll('script, style, .mw-editsection').forEach((node) => node.remove())
  clone.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
  clone.querySelectorAll('p, div, li, tr').forEach((node) => node.append('\n'))

  return normalizeDisplayText(clone.textContent ?? '')
}

function normalizeDisplayText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function slugifyModuleTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function encodeWikiPageForUrl(page: string): string {
  return page
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}
