#!/usr/bin/env node

import { runCli } from './skillsdock-core.mjs';

runCli().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
