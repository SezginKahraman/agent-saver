#!/usr/bin/env node
// packages/cli/src/index.ts
import { buildProgram } from './program.js';

buildProgram().parseAsync(process.argv).catch((err) => {
  console.error('error:', (err as Error).message);
  process.exit(1);
});
