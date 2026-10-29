import type { APIRoute, GetStaticPaths } from 'astro';
import { nonDefaultLocales } from '../../../i18n/locales';
import { regulationData } from '../../../lib/regulation-i18n';

export const prerender = true;

// The regulation index in an es or pt page's language (BL-153 Tier B): names
// translated, `nameEn` added. Every non-default locale, draft ones included,
// as the [locale] catch-all builds their pages (ADR-0030 § 4).
export const getStaticPaths: GetStaticPaths = () =>
  nonDefaultLocales().map((locale) => ({ params: { lang: locale.path }, props: { locale } }));

export const GET: APIRoute = async ({ props }) => {
  const { index } = await regulationData(props.locale);
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
