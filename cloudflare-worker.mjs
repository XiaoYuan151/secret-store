import dbModule from './web-db-d1.js';
import coreModule from './web-core.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const api = coreModule.createApi(dbModule.d1(env.DB), { sessionSecret: env.SESSION_SECRET, publicOrigin: env.PUBLIC_ORIGIN, secure: true });
    return api(request);
  }
};
