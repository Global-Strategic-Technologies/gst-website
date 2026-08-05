import type { JSONRPCMessage } from '@modelcontextprotocol/server';
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/server';

/**
 * Paired-pipe Transport for in-process protocol-roundtrip tests.
 *
 * `@modelcontextprotocol/sdk@1.29.0` does not export an in-memory test
 * transport. The architecture decision lives in
 * `src/docs/development/_archive/MCP_SERVER_ARCHITECTURE_BL-031_tests.md`.
 *
 * Two halves hold references to each other; `send()` on one side enqueues
 * the message into the other's `onmessage` callback via `queueMicrotask`.
 * Preserves JSON-RPC's async ordering invariants without making the helper
 * synchronous.
 */
class PairedHalf implements Transport {
  private partner: PairedHalf | null = null;
  onmessage?: (msg: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  link(partner: PairedHalf): void {
    this.partner = partner;
  }

  async start(): Promise<void> {
    /* no-op — both ends are in-process; nothing to start */
  }

  async send(message: JSONRPCMessage, _opts?: TransportSendOptions): Promise<void> {
    queueMicrotask(() => this.partner?.onmessage?.(message));
  }

  async close(): Promise<void> {
    this.partner = null;
    this.onclose?.();
  }
}

export function createPairedTransports(): { server: PairedHalf; client: PairedHalf } {
  const server = new PairedHalf();
  const client = new PairedHalf();
  server.link(client);
  client.link(server);
  return { server, client };
}

export type { PairedHalf };
