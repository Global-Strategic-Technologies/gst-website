import type { APIRoute } from 'astro';
import { fetchAllRegulations, getRegulationsByRegion } from '../../utils/fetchRegulations';

export const prerender = true;

export const GET: APIRoute = async () => {
  const regulations = await fetchAllRegulations();
  const regionMap = getRegulationsByRegion(regulations);

  return new Response(JSON.stringify(regionMap), {
    headers: { 'Content-Type': 'application/json' },
  });
};
