// Shared by sentry.client.config.ts and sentry.server.config.ts.
//
// SDK v11 replaced `sendDefaultPii` with `dataCollection`, and an UNSET
// `dataCollection` now collects user info (incl. inferred IP), cookies,
// request/response bodies and headers by default. Our legitimate-interest
// basis for running Sentry without consent depends on collecting no PII, so
// this pins the v10 `sendDefaultPii: false` baseline explicitly — taken
// verbatim from the v11 migration guide ("If you want to keep the v10 default
// behavior"). `userInfo: false` also keeps @sentry/astro's request handler
// from reporting `user.ip_address` (its `trackClientIp` follows it in v11).
const PII_HEADER_DENYLIST = ['forwarded', '-ip', 'remote-', 'via', '-user'];

export const dataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: PII_HEADER_DENYLIST },
    response: { deny: PII_HEADER_DENYLIST },
  },
  httpBodies: [],
  urlQueryParams: { deny: PII_HEADER_DENYLIST },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
};
