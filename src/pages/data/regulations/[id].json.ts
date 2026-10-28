import type { APIRoute, GetStaticPaths } from 'astro';
import { DEFAULT_LOCALE } from '../../../i18n/locales';
import { regulationData } from '../../../lib/regulation-i18n';

export const prerender = true;

// One English regulation. Each other locale's are at /data/regulations/<locale>/<id>.json.
export const getStaticPaths: GetStaticPaths = async () => {
  const { regulations } = await regulationData(DEFAULT_LOCALE);
  return regulations.map((reg) => ({
    params: { id: reg.id },
    props: { regulation: reg },
  }));
};

export const GET: APIRoute = ({ props }) => {
  return new Response(JSON.stringify(props.regulation), {
    headers: { 'Content-Type': 'application/json' },
  });
};
