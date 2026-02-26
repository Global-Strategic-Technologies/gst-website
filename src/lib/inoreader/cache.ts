/**
 * Dev-mode file cache for Inoreader API responses.
 *
 * Inoreader enforces a 200 requests/day rate limit (100/zone x 2 zones).
 * Each Radar page load makes ~7 API calls, so local dev can exhaust the
 * budget in under 15 page loads. This cache stores API responses on disk
 * with a 24-hour TTL, only active when import.meta.env.DEV is true.
 *
 * Cache location: .cache/inoreader/ (gitignored)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = join(process.cwd(), '.cache', 'inoreader');
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

export function buildCacheKey(fn: string, ...args: unknown[]): string {
  const raw = JSON.stringify({ fn, args });
  return createHash('sha256').update(raw).digest('hex');
}

export function getCachedResponse<T>(cacheKey: string): T | null {
  const filePath = join(CACHE_DIR, `${cacheKey}.json`);

  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const entry: CacheEntry<T> = JSON.parse(raw);

    if (Date.now() - entry.timestamp > TTL_MS) {
      return null; // expired
    }

    return entry.data;
  } catch {
    return null;
  }
}

export function setCachedResponse<T>(cacheKey: string, data: T): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });

    const entry: CacheEntry<T> = {
      timestamp: Date.now(),
      data,
    };

    writeFileSync(
      join(CACHE_DIR, `${cacheKey}.json`),
      JSON.stringify(entry),
      'utf-8',
    );
  } catch (error) {
    console.warn(`[Radar] Failed to write dev cache: ${(error as Error).message}`);
  }
}
