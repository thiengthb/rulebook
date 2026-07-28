/**
 * HTTP entrypoint — Streamable HTTP, stateless. Plan Step 1.3.
 *
 * No framework on purpose (settled with the supervisor 2026-07-29): this service has one tool and
 * no pages, so the Next.js + `mcp-handler` shape the sibling apps use would drag a whole web
 * framework in for nothing. The cost of that choice is recorded in the plan: when Phase 4 extracts
 * the OAuth shim (idea-0013), it has to cover two server shapes rather than one.
 *
 * Stateless: a fresh server + transport per request, no session store. One tool, no subscriptions,
 * nothing to keep between calls — and it means an outage cannot leave a client wedged in a session
 * that no longer exists.
 */

import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createRulebookServer, SERVER_NAME, SERVER_VERSION } from './mcp-server.js';

// Turn request logging on for a real server run. Unit tests build the server directly and never
// set this, so the suite writes no log. The check-in gate reads the file this produces.
process.env.RULEBOOK_LOG_DIR ??= new URL('../../logs/', import.meta.url).pathname;

const PORT = Number(process.env.PORT ?? 3901);
const HOST = process.env.HOST ?? '127.0.0.1';

async function readBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const http = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, name: SERVER_NAME, version: SERVER_VERSION }));
    return;
  }

  if (!req.url?.startsWith('/mcp')) {
    res.writeHead(404).end();
    return;
  }

  // A new server+transport per request. `sessionIdGenerator: undefined` = stateless mode.
  const server = createRulebookServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, await readBody(req));
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: err instanceof Error ? err.message : 'internal error' },
          id: null,
        }),
      );
    }
  }
});

http.listen(PORT, HOST, () => {
  console.error(`${SERVER_NAME} v${SERVER_VERSION} listening on http://${HOST}:${PORT}/mcp`);
});
