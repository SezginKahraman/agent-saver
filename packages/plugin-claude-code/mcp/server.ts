// packages/plugin-claude-code/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { VERSION } from '@agent-saver/core';
import { saveAgentTool, saveAgentHandler } from './tools/save-agent.js';
import { loadAgentTool, loadAgentHandler } from './tools/load-agent.js';
import { listAgentsTool, listAgentsHandler } from './tools/list-agents.js';

const server = new Server(
  { name: 'agent-saver', version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [saveAgentTool, loadAgentTool, listAgentsTool],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (name === 'save_agent') return saveAgentHandler(args ?? {});
  if (name === 'load_agent') return loadAgentHandler(args ?? {});
  if (name === 'list_agents') return listAgentsHandler(args ?? {});
  throw new Error(`unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
