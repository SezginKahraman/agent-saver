// packages/plugin-claude-code/mcp/tools/list-agents.ts
import { list } from '@agent-saver/core';

export const listAgentsTool = {
  name: 'list_agents',
  description: 'List all saved agents in the current project and global scope.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['project', 'global', 'auto'] },
    },
  },
} as const;

function ageDays(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d === 0) return 'today';
  if (d === 1) return '1d';
  return `${d}d`;
}

export async function listAgentsHandler(args: Record<string, unknown>) {
  const scope = (args.scope as 'project' | 'global' | 'auto' | undefined) ?? 'auto';
  const refs = await list({ scope });
  if (refs.length === 0) {
    return { content: [{ type: 'text', text: '(no saved agents)' }] };
  }
  const header = '| Name | Scope | Age | Msgs | Description |';
  const sep = '| --- | --- | --- | --- | --- |';
  const rows = refs.map(
    (r) =>
      `| ${r.name} | ${r.scope} | ${ageDays(r.metadata.created_at)} | ${r.metadata.message_count} | ${r.metadata.description ?? ''} |`,
  );
  return { content: [{ type: 'text', text: [header, sep, ...rows].join('\n') }] };
}
