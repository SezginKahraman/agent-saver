// packages/plugin-claude-code/mcp/tools/save-agent.ts
import { ClaudeCodeAdapter } from '@agent-saver/adapter-claude-code';
import { save } from '@agent-saver/core';

export const saveAgentTool = {
  name: 'save_agent',
  description:
    'Save the current Claude Code session as a named agent. Use when the user says "/save <name>" or asks to snapshot the conversation.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Unique name for the saved agent.' },
      description: { type: 'string', description: 'Optional short description.' },
      global: { type: 'boolean', description: 'Save to global scope instead of project.' },
    },
    required: ['name'],
  },
} as const;

export async function saveAgentHandler(args: Record<string, unknown>) {
  const name = String(args.name);
  const description = typeof args.description === 'string' ? args.description : undefined;
  const scope = args.global === true ? 'global' : 'project';

  const adapter = new ClaudeCodeAdapter();
  const ref = await save(adapter, name, {
    scope,
    ...(description !== undefined && { description }),
  });

  const text = `✓ Saved ${ref.name} (${ref.metadata.message_count} msgs, ~${ref.metadata.estimated_tokens} tokens, ${ref.scope} scope)`;
  return { content: [{ type: 'text', text }] };
}
