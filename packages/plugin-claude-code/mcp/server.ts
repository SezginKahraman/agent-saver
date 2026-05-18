// packages/plugin-claude-code/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { VERSION } from '@agent-saver/core';
import { saveAgentTool, saveAgentHandler } from './tools/save-agent.js';
import { loadAgentTool, loadAgentHandler } from './tools/load-agent.js';
import { listAgentsTool, listAgentsHandler } from './tools/list-agents.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
}>;

const tools = [
  { def: saveAgentTool, handler: saveAgentHandler },
  { def: loadAgentTool, handler: loadAgentHandler },
  { def: listAgentsTool, handler: listAgentsHandler },
] as const;

const handlers = new Map<string, ToolHandler>(
  tools.map((t) => [t.def.name, t.handler as ToolHandler]),
);

const server = new Server(
  { name: 'agent-saver', version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => t.def),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const handler = handlers.get(req.params.name);
  if (!handler) throw new Error(`unknown tool: ${req.params.name}`);
  return handler(req.params.arguments ?? {});
});

const transport = new StdioServerTransport();
await server.connect(transport);
