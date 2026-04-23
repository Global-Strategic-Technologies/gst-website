import type { APIRoute, GetStaticPaths } from 'astro';
import { fetchAllRegulations } from '../../../utils/fetchRegulations';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const regulations = await fetchAllRegulations();
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
