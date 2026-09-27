/**
 * BL-166 — the `gst_radar_brief_today` embed is scope-gated on the Worker.
 *
 * The prompt embeds the radar FYI snapshot, which is the same Inoreader-funded
 * feed the radar Resource guards with `resource:radar:read`. Before BL-166 the
 * embed had no scope check, so a trial could read radar through `prompts/get`.
 * Now a Worker-side server built for a caller without that scope gets NO
 * reader and the `RADAR_NOT_GRANTED_REMOTE` text instead.
 *
 * Built like `metrics-emission.test.ts`: a real `createServer` in Worker mode
 * over the SDK's in-memory transport, with an empty env (so a granted caller's
 * cache-only reader finds nothing and returns the cold-cache text — which is
 * what tells the two branches apart here without Upstash). The prompt TEMPLATE
 * bytes are unchanged; the body-hash and prompt-compat suites cover that.
 */
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { InMemoryIrlBodyCache } from '../../src/cache/irl-body-cache';
import { createServer } from '../../src/server';
import { DEFAULT_SCOPES, TRIAL_SCOPES } from '../../src/auth/scopes';
import {
  RADAR_NOT_GRANTED_REMOTE,
  SNAPSHOT_UNAVAILABLE_REMOTE,
} from '../../src/content/radar-messages';
import type { Env } from '../../src/worker';

async function radarBriefFor(scopes: readonly string[]) {
  const env: Env = {};
  const server = createServer(env, {
    radarSource: 'worker',
    scopes,
    irlBodyCache: new InMemoryIrlBodyCache(),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'radar-prompt-scope-gate-test', version: '0.0.0' });
  await client.connect(clientTransport);
  const result = await client.getPrompt({ name: 'gst_radar_brief_today', arguments: {} });
  await client.close();
  return result.messages;
}

/** The embedded block is the prompt's second message. */
function embeddedText(messages: Awaited<ReturnType<typeof radarBriefFor>>): string {
  expect(messages).toHaveLength(2);
  const content = messages[1]!.content as { type: string; text?: string };
  expect(content.type).toBe('text');
  return content.text ?? '';
}

describe('gst_radar_brief_today embed — Worker scope gate (BL-166)', () => {
  it('a caller without resource:radar:read gets the not-granted text, not the feed', async () => {
    const text = embeddedText(await radarBriefFor(TRIAL_SCOPES));
    expect(text).toBe(RADAR_NOT_GRANTED_REMOTE);
    expect(text).toContain('resource:radar:read');
  });

  it('a caller with resource:radar:read reads through the cache-only reader', async () => {
    // Empty env → cold cache → the degraded "unavailable" text. The point is
    // that the READER ran: the not-granted text would mean it was withheld.
    const text = embeddedText(await radarBriefFor(DEFAULT_SCOPES));
    expect(text).toBe(SNAPSHOT_UNAVAILABLE_REMOTE);
  });

  it('the prompt body itself is identical either way', async () => {
    const granted = await radarBriefFor(DEFAULT_SCOPES);
    const withheld = await radarBriefFor(TRIAL_SCOPES);
    expect(withheld[0]).toEqual(granted[0]);
  });
});
