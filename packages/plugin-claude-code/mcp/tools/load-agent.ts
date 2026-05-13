// packages/plugin-claude-code/mcp/tools/load-agent.ts
import { ClaudeCodeAdapter } from '@agent-saver/adapter-claude-code';
import { load } from '@agent-saver/core';

export const loadAgentTool = {
  name: 'load_agent',
  description:
    'Resolve a saved agent and return the shell command to resume it in a new terminal. Use when the user says "/load <name>".',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      global: { type: 'boolean' },
    },
    required: ['name'],
  },
} as const;

export async function loadAgentHandler(args: Record<string, unknown>) {
  const name = String(args.name);
  const scope = args.global === true ? 'global' : 'auto';

  const adapter = new ClaudeCodeAdapter();
  const result = await load(adapter, name, { scope });

  const text = `Loaded ${result.agent.name}. Run in a new terminal:\n\n  ${result.resumeCommand}\n`;
  return { content: [{ type: 'text', text }] };
}
