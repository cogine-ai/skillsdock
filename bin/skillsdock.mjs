#!/usr/bin/env node

import { runCli } from './skillsdock-core.mjs';

runCli().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  const exitCode =
    error && typeof error === 'object' && typeof error.exitCode === 'number' ? error.exitCode : 1;
  process.exit(exitCode);
});
