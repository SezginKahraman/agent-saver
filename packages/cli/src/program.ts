// packages/cli/src/program.ts
import { Command } from 'commander';
import { ClaudeCodeAdapter } from '@agent-saver/adapter-claude-code';
import { save, load, list, VERSION } from '@agent-saver/core';
import { formatList } from './format.js';

export function buildProgram(): Command {
  const program = new Command();
  program.name('agent-saver').version(VERSION).description('Save and reload Claude Code agent sessions.');

  program
    .command('save <name>')
    .option('-d, --description <desc>', 'short human description')
    .option('-g, --global', 'save into ~/.claude/agents instead of project-local')
    .action(async (name: string, opts: { description?: string; global?: boolean }) => {
      const adapter = new ClaudeCodeAdapter();
      const ref = await save(adapter, name, {
        scope: opts.global ? 'global' : 'project',
        ...(opts.description !== undefined && { description: opts.description }),
      });
      console.log(`✓ Saved ${ref.name} (${ref.metadata.message_count} msgs, ~${ref.metadata.estimated_tokens} tokens)`);
    });

  program
    .command('load <name>')
    .option('-g, --global', 'force global scope')
    .action(async (name: string, opts: { global?: boolean }) => {
      const adapter = new ClaudeCodeAdapter();
      const result = await load(adapter, name, { scope: opts.global ? 'global' : 'auto' });
      console.log(`Loaded ${result.agent.name}. Run in a new terminal:\n\n  ${result.resumeCommand}\n`);
    });

  program
    .command('list')
    .option('-s, --scope <scope>', 'project | global | auto', 'auto')
    .action(async (opts: { scope: 'project' | 'global' | 'auto' }) => {
      const refs = await list({ scope: opts.scope });
      console.log(formatList(refs));
    });

  return program;
}
