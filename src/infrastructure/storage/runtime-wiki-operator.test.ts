import { describe, expect, it } from 'vitest'
import {
  loadRuntimeWikiOperatorArchive,
  parseRuntimeWikiOperatorHtml,
} from './runtime-wiki-operator'

describe('runtime wiki operator parser', () => {
  it('extracts archive sections, modules and confidential records from rendered wiki html', () => {
    const parsed = parseRuntimeWikiOperatorHtml({
      operatorSlug: 'operator-closur',
      operatorName: '可露希尔',
      page: '可露希尔',
      html: `
        <h2><span class="mw-headline" id="模组">模组</span></h2>
        <h3><span class="mw-headline" id="可露希尔证章">可露希尔证章</span></h3>
        <div><p>ORIGINAL<br />可露希尔证章<br />基础证章，无特殊效果。</p></div>
        <h3><span class="mw-headline" id="给自己的小奖杯">给自己的小奖杯</span></h3>
        <div>
          <p>ORIGINAL<br />给自己的小奖杯<br />基础证章，无特殊效果。</p>
          <p>STAGE MAX<br />基础信息<br />第一段<br />第二段<br />任务1<br />不应进入基础信息</p>
        </div>
        <h3><span class="mw-headline" id="连续文本模组">连续文本模组</span></h3>
        <div>
          <p>CHG-X 连续文本模组 调整效果 基础信息 全文阅读 连续第一段。连续第二段。 攻击 +65 模组解锁任务 不应进入基础信息</p>
        </div>

        <h2><span class="mw-headline" id="干员档案">干员档案</span></h2>
        <table>
          <tr><th><div class="poem"><p>基础档案</p></div></th></tr>
          <tr><th><small>初始开放</small></th></tr>
          <tr><td><div class="poem"><p>【代号】可露希尔<br />【性别】女</p></div></td></tr>
          <tr><th><div class="poem"><p>档案资料一</p></div></th></tr>
          <tr><th><small>提升信赖至50%以查看</small></th></tr>
          <tr><td><div class="poem"><p>可露希尔，罗德岛总工程师。</p></div></td></tr>
        </table>

        <h2><span class="mw-headline" id="干员密录">干员密录</span></h2>
        <table>
          <tr>
            <td>
              <b>精英化2 Lv.1</b>
              <b>分身有术</b>
              <a href="/w/%E5%8F%AF%E9%9C%B2%E5%B8%8C%E5%B0%94/%E5%B9%B2%E5%91%98%E5%AF%86%E5%BD%95/1">播放</a>
            </td>
          </tr>
        </table>
        <h2><span class="mw-headline" id="干员模型">干员模型</span></h2>
      `,
    })

    expect(parsed.archive.profile).toMatchObject({
      档案1: '基础档案',
      档案1条件: '初始开放',
      档案1文本: '【代号】可露希尔\n【性别】女',
      档案2: '档案资料一',
      档案2条件: '提升信赖至50%以查看',
      档案2文本: '可露希尔，罗德岛总工程师。',
    })
    expect(parsed.modules.modules.map((module) => module.name)).toEqual([
      '可露希尔证章',
      '给自己的小奖杯',
      '连续文本模组',
    ])
    expect(parsed.modules.modules[0]?.fields).toEqual({})
    expect(parsed.modules.modules[1]?.fields.基础信息).toBe('第一段\n第二段')
    expect(parsed.modules.modules[2]?.fields.基础信息).toBe('连续第一段。连续第二段。')
    expect(parsed.confidential.records).toEqual([
      expect.objectContaining({
        title: '分身有术',
        page: '可露希尔/干员密录/1',
        contentSource: expect.objectContaining({
          url: 'https://prts.wiki/w/%E5%8F%AF%E9%9C%B2%E5%B8%8C%E5%B0%94/%E5%B9%B2%E5%91%98%E5%AF%86%E5%BD%95/1',
        }),
      }),
    ])
  })

  it('requests the mobile wiki API directly to avoid mobile user-agent redirects', async () => {
    let requestedUrl = ''
    const fetchImpl = (async (url: RequestInfo | URL) => {
      requestedUrl = String(url)
      return new Response(
        JSON.stringify({
          parse: {
            title: '可露希尔',
            text: {
              '*': `
                <h2><span class="mw-headline" id="干员档案">干员档案</span></h2>
                <table>
                  <tr><th><div class="poem"><p>基础档案</p></div></th></tr>
                  <tr><th><small>初始开放</small></th></tr>
                  <tr><td><div class="poem"><p>【代号】可露希尔</p></div></td></tr>
                </table>
              `,
            },
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    }) as typeof fetch

    const archive = await loadRuntimeWikiOperatorArchive(
      {
        operatorSlug: 'operator-closur',
        operatorName: '可露希尔',
        page: '可露希尔',
      },
      fetchImpl
    )

    expect(new URL(requestedUrl).hostname).toBe('m.prts.wiki')
    expect(archive.profile.档案1文本).toBe('【代号】可露希尔')
  })

  it('extracts modules from mobile wiki section wrappers', () => {
    const parsed = parseRuntimeWikiOperatorHtml({
      operatorSlug: 'operator-bagpipe',
      operatorName: '风笛',
      page: '风笛',
      html: `
        <h2 class="section-heading">
          <span class="mw-headline" id="模组">模组</span>
        </h2>
        <section class="mf-section-12 collapsible-block">
          <h3><span class="mw-headline" id="风笛证章">风笛证章</span></h3>
          <div><p>ORIGINAL<br />风笛证章<br />基础证章，无特殊效果。</p></div>
          <h3><span class="mw-headline" id="破城矛弹夹">破城矛弹夹</span></h3>
          <div>
            <p>
              STAGE MAX<br />
              基础信息<br />
              维多利亚军工旧制式弹夹。<br />
              模组解锁任务<br />
              完成一次作战。
            </p>
          </div>
        </section>
      `,
    })

    expect(parsed.modules.modules.map((module) => module.name)).toEqual(['风笛证章', '破城矛弹夹'])
    expect(parsed.modules.modules[1]?.fields.基础信息).toBe('维多利亚军工旧制式弹夹。')
  })

  it.each([false, true])('extracts wrapped MediaWiki headings (mobile section: %s)', (mobile) => {
    const content = `
      <div class="mw-heading mw-heading3">
        <h3 id="测试模组">测试模组</h3><span class="mw-editsection">编辑</span>
      </div>
      <div><p>基础信息<br />模组说明<br />攻击 +65</p></div>
    `
    const parsed = parseRuntimeWikiOperatorHtml({
      operatorSlug: 'operator-test',
      operatorName: '测试干员',
      page: '测试干员',
      html: `
        <div class="mw-heading mw-heading2"><h2 id="模组">模组</h2></div>
        ${mobile ? `<section>${content}</section>` : content}
        <div class="mw-heading mw-heading2"><h2 id="干员档案">干员档案</h2></div>
        <table>
          <tr><th>基础档案</th></tr>
          <tr><th><small>初始开放</small></th></tr>
          <tr><td>测试档案正文</td></tr>
        </table>
        <div class="mw-heading mw-heading2"><h2 id="语音记录">语音记录</h2></div>
        <table><tr><th>不应进入档案</th></tr><tr><td>语音正文</td></tr></table>
        <div class="mw-heading mw-heading2"><h2 id="干员密录">干员密录</h2></div>
        <table><tr><td><b>测试秘录</b><a href="/w/测试干员/干员密录/1">播放</a></td></tr></table>
        <div class="mw-heading mw-heading2"><h2 id="干员模型">干员模型</h2></div>
        <a href="/w/测试干员/干员密录/2">不应进入秘录</a>
      `,
    })

    expect(parsed.archive.profile).toEqual({
      档案1: '基础档案',
      档案1条件: '初始开放',
      档案1文本: '测试档案正文',
    })
    expect(parsed.modules.modules).toEqual([
      expect.objectContaining({ name: '测试模组', fields: { 基础信息: '模组说明' } }),
    ])
    expect(parsed.confidential.records).toHaveLength(1)
    expect(parsed.confidential.records[0]?.title).toBe('测试秘录')
  })
})
