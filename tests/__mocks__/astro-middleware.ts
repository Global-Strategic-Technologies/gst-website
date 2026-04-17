/**
 * Stub for astro:middleware virtual module.
 * Provides a no-op defineMiddleware so src/middleware.ts can be
 * imported in vitest for testing the SECURITY_HEADERS export.
 */
export function defineMiddleware(handler: unknown) {
  return handler;
}
