import type { APIRoute, GetStaticPaths } from 'astro';
import { nonDefaultLocales } from '../../../../i18n/locales';
import { regulationData } from '../../../../lib/regulation-i18n';

export const prerender = true;

// One regulation in an es or pt page's language (BL-153 Tier B): prose from
// the `regulatory-map-data` catalog, ids, dates and regions unchanged.
export const getStaticPaths: GetStaticPaths = async () => {
  const paths = [];
  for (const locale of nonDefaultLocales()) {
    const { regulations } = await regulationData(locale);
    for (const regulation of regulations) {
      paths.push({ params: { lang: locale.path, id: regulation.id }, props: { regulation } });
    }
  }
  return paths;
};

export const GET: APIRoute = ({ props }) => {
  return new Response(JSON.stringify(props.regulation), {
    headers: { 'Content-Type': 'application/json' },
  });
};
