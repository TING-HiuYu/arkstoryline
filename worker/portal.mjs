export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    if (url.hostname === 'thy.icu' && path === '/') {
      url.pathname = '/_portal/'
      return env.ASSETS.fetch(new Request(url, request))
    }
    if (path === '/ark/storyline') {
      url.pathname += '/'
      return Response.redirect(url.toString(), 308)
    }
    if (
      path.startsWith('/ark/storyline/') &&
      request.headers.get('sec-fetch-mode') === 'navigate' &&
      !/\.[^/]+$/.test(path)
    ) {
      url.pathname = '/ark/storyline/'
      return env.ASSETS.fetch(new Request(url, request))
    }
    return env.ASSETS.fetch(request)
  },
}
