/* global Response caches */

/**
 * Retrieve metrics in prometheus exposition format.
 * https://prometheus.io/docs/instrumenting/exposition_formats/
 * @param {Request} request
 * @param {import('../env').Env} env
 * @param {import('../index').Ctx} ctx
 * @returns {Promise<Response>}
 */
export async function cacheWarmFromBackupUrlGet(request, env, ctx) {
  // TODO: Auth?
  const params = request.params
  let url
  try {
    url = new URL(decodeURIComponent(params.url))
  } catch (err) {}

  console.log('url', url)
  return new Response()
}
