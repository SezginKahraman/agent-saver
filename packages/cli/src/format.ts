// packages/cli/src/format.ts
import type { AgentRef } from '@agent-saver/core';

export function formatAgentLine(ref: AgentRef): string {
  const desc = ref.metadata.description ? ` — ${ref.metadata.description}` : '';
  return `[${ref.scope}] ${ref.name}  (${ref.metadata.message_count} msgs)${desc}`;
}

export function formatList(refs: AgentRef[]): string {
  if (refs.length === 0) return '(no saved agents)';
  return refs.map(formatAgentLine).join('\n');
}
