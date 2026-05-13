function shellQuote(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

export function buildResumeCommand(sessionId: string, sourceCwd: string, currentCwd: string): string {
  const base = `claude --resume ${sessionId}`;
  if (sourceCwd === currentCwd) return base;
  return `cd ${shellQuote(sourceCwd)} && ${base}`;
}
