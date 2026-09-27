/**
 * BL-166 — the tool-scope gate that checks every `tools/call` against the
 * caller's tool scopes.
 *
 * Pure function; the wiring (after the tier gate, before the limiter, logged,
 * no AE event) is proved by `handle-authenticated-metrics.test.ts` and the
 * Worker round trip by `tests/integration/oauth-m2m.test.ts`.
 */

import { requiredToolScope, toolScopeDenial } from '../../../src/pipeline/tool-scope-gate';
import { DEFAULT_SCOPES } from '../../../src/auth/scopes';
import type { AuthSuccess } from '../../../src/auth/bearer';

const auth = (scopes: readonly string[], over: Partial<AuthSuccess> = {}): AuthSuccess => ({
  ok: true,
  keyOwner: 'OAUTH:M2M:ACME',
  scopes,
  tier: 'paid',
  ...over,
});

async function refusalBody(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toBe('application/json');
  return (await res.json()) as {
    jsonrpc: string;
    id: unknown;
    error: { code: number; message: string; data: { missingScope: string; ownedScopes: string[] } };
  };
}

describe('requiredToolScope', () => {
  it('puts radar tools in the explicit radar namespace and the rest under tool:', () => {
    expect(requiredToolScope('search_radar')).toBe('tool:radar:search_radar');
    expect(requiredToolScope('get_latest_insights')).toBe('tool:radar:get_latest_insights');
    expect(requiredToolScope('search_portfolio')).toBe('tool:search_portfolio');
  });
});

describe('toolScopeDenial', () => {
  it('refuses radar to a tool:*-only client, naming tool:radar:* and echoing the id', async () => {
    const denied = toolScopeDenial(auth(['tool:*']), { name: 'search_radar', id: 'r-1' });
    expect(denied).not.toBeNull();
    expect(denied!.missingScope).toBe('tool:radar:*');
    expect(await refusalBody(denied!.response)).toEqual({
      jsonrpc: '2.0',
      id: 'r-1',
      error: {
        code: -32002,
        message: 'Missing required scope: tool:radar:*',
        data: { missingScope: 'tool:radar:*', ownedScopes: ['tool:*'] },
      },
    });
  });

  it('allows a tool:*-only client every non-radar tool', () => {
    expect(toolScopeDenial(auth(['tool:*']), { name: 'search_portfolio', id: 1 })).toBeNull();
    expect(toolScopeDenial(auth(['tool:*']), { name: 'compute_techpar', id: 1 })).toBeNull();
  });

  it('refuses a tool the narrow grant does not name', async () => {
    const narrow = auth(['tool:search_portfolio']);
    expect(toolScopeDenial(narrow, { name: 'search_portfolio', id: 1 })).toBeNull();
    const denied = toolScopeDenial(narrow, { name: 'compute_techpar', id: 3 });
    expect(denied!.missingScope).toBe('tool:compute_techpar');
    const body = await refusalBody(denied!.response);
    expect(body.id).toBe(3);
    expect(body.error.code).toBe(-32002);
    expect(body.error.data.missingScope).toBe('tool:compute_techpar');
  });

  it('refuses an unknown tool name to a narrow grant as -32002 tool:<name>, not unknown-tool', async () => {
    // Harmless by design: the gate cannot tell an unknown name from a real
    // one it has no scope for, and it runs before the SDK's own lookup.
    const denied = toolScopeDenial(auth(['tool:search_portfolio']), {
      name: 'no_such_tool',
      id: 9,
    });
    expect(denied!.missingScope).toBe('tool:no_such_tool');
    expect((await refusalBody(denied!.response)).error.code).toBe(-32002);
  });

  it('lets DEFAULT_SCOPES (roster keys, the latency probe) call every tool, radar included', () => {
    for (const name of ['search_radar', 'get_latest_insights', 'search_portfolio']) {
      expect(toolScopeDenial(auth(DEFAULT_SCOPES), { name, id: 1 })).toBeNull();
    }
  });

  it('lets tool:radar:* alone call the radar tools and nothing else', () => {
    const radarOnly = auth(['tool:radar:*']);
    expect(toolScopeDenial(radarOnly, { name: 'search_radar', id: 1 })).toBeNull();
    expect(toolScopeDenial(radarOnly, { name: 'search_portfolio', id: 1 })).not.toBeNull();
  });

  it('refuses tools to a resource-only key such as MCP_KEY_WEBSITE_RADAR', () => {
    const websiteRadar = auth(['resource:radar:read']);
    expect(toolScopeDenial(websiteRadar, { name: 'search_radar', id: 1 })).not.toBeNull();
    expect(toolScopeDenial(websiteRadar, { name: 'search_portfolio', id: 1 })).not.toBeNull();
  });

  it('passes every non-tools/call request', () => {
    expect(toolScopeDenial(auth([]), null)).toBeNull();
  });
});
