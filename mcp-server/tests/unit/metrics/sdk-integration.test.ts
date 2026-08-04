/**
 * BL-032.75 Phase 1 — SDK type-compat spike (M4 from the Phase 1 Steps 1-3
 * audit). Verifies that `withToolMetrics` / `withResourceMetrics` /
 * `withPromptMetrics` can actually wrap handlers that the real MCP SDK
 * `registerTool` / `registerResource` / `registerPrompt` signatures accept.
 *
 * Catches the case where the HOF's variadic `TArgs extends readonly unknown[]`
 * pattern doesn't infer correctly against the SDK's named-argument callbacks
 * (`ToolCallback<Args> = (args, extra) => Promise<CallToolResult>`).
 *
 * Each test registers a handler, then invokes it through the SDK's in-memory
 * client/transport pair and asserts both the handler ran and the metric event
 * landed. If either the registration or the invocation typechecks fail, the
 * test won't compile — making this both a runtime AND a compile-time check.
 *
 * Lightweight (no Worker runtime, no `agents/mcp` adapter) — focused on the
 * SDK's own `McpServer` + `Client` types. The bigger end-to-end integration
 * test (Step 7) will exercise the full `createServer` → `Client` round-trip.
 */
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { InMemorySink } from '../../../src/metrics/sinks/in-memory';
import { toolOk, toolFail } from '../../../src/tools/_result';
import {
  withPromptMetrics,
  withResourceMetrics,
  withToolMetrics,
} from '../../../src/metrics/with-metrics';

async function connectInMemory(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

describe('M4 — withToolMetrics typecheck + runtime against real McpServer', () => {
  it('registers + invokes a real Tool through the SDK; metric event lands', async () => {
    const sink = new InMemorySink();
    const ctx = { sink, keyOwner: 'TEST' };

    const server = new McpServer({ name: 'spike', version: '0.0.0' });
    server.registerTool(
      'echo',
      {
        title: 'Echo',
        description: 'Returns its input',
        inputSchema: { msg: z.string() },
      },
      withToolMetrics('echo', ctx, async (args) => {
        return {
          content: [{ type: 'text' as const, text: args.msg }],
        };
      })
    );

    const client = await connectInMemory(server);
    const result = await client.callTool({ name: 'echo', arguments: { msg: 'hi' } });
    expect(result.content).toEqual([{ type: 'text', text: 'hi' }]);
    expect(sink.events.filter((e) => e.event_type === 'tool_invocation')).toHaveLength(1);
    expect(sink.events.at(-1)).toMatchObject({
      event_type: 'tool_invocation',
      name: 'echo',
      keyOwner: 'TEST',
      outcome: 'success',
    });
    await client.close();
  });

  it('emits outcome=error when the wrapped Tool returns isError=true', async () => {
    const sink = new InMemorySink();
    const ctx = { sink };

    const server = new McpServer({ name: 'spike', version: '0.0.0' });
    server.registerTool(
      'fails',
      {
        title: 'Fails',
        description: 'Always errors',
        inputSchema: {},
      },
      withToolMetrics('fails', ctx, async () => ({
        isError: true,
        content: [{ type: 'text' as const, text: 'no good' }],
      }))
    );

    const client = await connectInMemory(server);
    await client.callTool({ name: 'fails', arguments: {} });
    expect(sink.events.at(-1)).toMatchObject({ name: 'fails', outcome: 'error' });
    await client.close();
  });

  // BL-090 — the two constructors, exercised through a REAL McpServer + client
  // rather than by calling the handler directly. This is the CI-resident proof
  // that the new envelope shapes survive the SDK round-trip; before BL-090 no
  // error result carried `structuredContent` at all, and `validateToolOutput`
  // (server/mcp.js) treats structured output specially, so "it type-checks" was
  // not sufficient evidence.
  it('toolOk sends the payload once — structuredContent over the wire, caption in content', async () => {
    const server = new McpServer({ name: 'spike', version: '0.0.0' });
    server.registerTool(
      'ok_tool',
      { title: 'Ok', description: 'Succeeds', inputSchema: {} },
      withToolMetrics('ok_tool', { sink: new InMemorySink() }, async () =>
        toolOk({ matches: ['a', 'b'], totalMatched: 2 }, '2 matches.')
      )
    );

    const client = await connectInMemory(server);
    const result = await client.callTool({ name: 'ok_tool', arguments: {} });

    expect(result.structuredContent).toEqual({ matches: ['a', 'b'], totalMatched: 2 });
    expect(result.content).toEqual([{ type: 'text', text: '2 matches.' }]);
    await client.close();
  });

  it('toolFail delivers a structured error AND the verbatim directive through the SDK', async () => {
    const directive = [
      'Audit FAILED.',
      '  1. `arr` is annualized.',
      '     Fix: pass monetaryBasis.',
    ].join('\n');
    const server = new McpServer({ name: 'spike', version: '0.0.0' });
    server.registerTool(
      'fail_tool',
      { title: 'Fail', description: 'Fails', inputSchema: {} },
      withToolMetrics('fail_tool', { sink: new InMemorySink() }, async () =>
        toolFail('audit-failed', directive, { status: 400 })
      )
    );

    const client = await connectInMemory(server);
    const result = await client.callTool({ name: 'fail_tool', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: 'audit-failed',
      message: directive,
      status: 400,
    });
    // The multi-line retry directive must reach the model byte-for-byte.
    expect(result.content).toEqual([{ type: 'text', text: directive }]);
    await client.close();
  });
});

describe('M4 — withPromptMetrics typecheck + runtime', () => {
  it('registers + invokes a Prompt through the SDK', async () => {
    const sink = new InMemorySink();
    const ctx = { sink, keyOwner: 'TEST' };

    const server = new McpServer({ name: 'spike', version: '0.0.0' });
    server.registerPrompt(
      'greet',
      {
        description: 'Says hello',
        argsSchema: { who: z.string() },
      },
      withPromptMetrics('greet', ctx, async (args) => ({
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: `Hello, ${args.who}` },
          },
        ],
      }))
    );

    const client = await connectInMemory(server);
    const result = await client.getPrompt({ name: 'greet', arguments: { who: 'world' } });
    expect(result.messages).toHaveLength(1);
    expect(sink.events.at(-1)).toMatchObject({
      event_type: 'prompt_invocation',
      name: 'greet',
      keyOwner: 'TEST',
      outcome: 'success',
    });
    await client.close();
  });
});

describe('M4 — withResourceMetrics typecheck + runtime', () => {
  it('registers + reads a Resource through the SDK', async () => {
    const sink = new InMemorySink();
    const ctx = { sink, keyOwner: 'TEST' };

    const server = new McpServer({ name: 'spike', version: '0.0.0' });
    const uri = 'spike://hello';
    server.registerResource(
      'hello',
      uri,
      { title: 'Hello', mimeType: 'text/plain' },
      withResourceMetrics(uri, ctx, async (u) => ({
        contents: [{ uri: u.href, mimeType: 'text/plain', text: 'hello' }],
      }))
    );

    const client = await connectInMemory(server);
    const result = await client.readResource({ uri });
    expect(result.contents[0]).toMatchObject({ text: 'hello' });
    expect(sink.events.at(-1)).toMatchObject({
      event_type: 'resource_read',
      name: uri,
      keyOwner: 'TEST',
      outcome: 'success',
    });
    await client.close();
  });
});
