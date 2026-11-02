export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const prefix = env.SITE_BASE_PATH
    if (url.pathname === prefix) {
      url.pathname += '/'
      return Response.redirect(url.toString(), 308)
    }
    if (
      url.pathname.startsWith(`${prefix}/`) &&
      request.headers.get('sec-fetch-mode') === 'navigate'
    ) {
      url.pathname = `${prefix}/`
      return env.ASSETS.fetch(new Request(url, request))
    }
    return env.ASSETS.fetch(request)
  },
}
