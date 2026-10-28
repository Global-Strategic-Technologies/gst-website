import type { APIRoute } from 'astro';
import { DEFAULT_LOCALE } from '../../i18n/locales';
import { regulationData } from '../../lib/regulation-i18n';

export const prerender = true;

// The English index. Each other locale's is at /data/reg-index/<locale>.json.
// The page appends regulationData()'s `version`, a hash of what is served here.
export const GET: APIRoute = async () => {
  const { index } = await regulationData(DEFAULT_LOCALE);
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
