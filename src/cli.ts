#!/usr/bin/env bun
import { runReconstruct } from './commands/reconstruct';

const [command, ...rest] = process.argv.slice(2);

if (command !== 'reconstruct') {
  console.error('usage: xray reconstruct <bundle.zip|dir> --out <dir>');
  process.exit(1);
}

await runReconstruct(rest);
