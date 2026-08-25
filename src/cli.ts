#!/usr/bin/env bun
const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'reconstruct': {
    const { runReconstruct } = await import('./commands/reconstruct');
    await runReconstruct(rest);
    break;
  }
  case 'install': {
    const { runInstall } = await import('./commands/install');
    await runInstall(rest);
    break;
  }
  case 'uninstall': {
    const { runUninstall } = await import('./commands/install');
    await runUninstall(rest);
    break;
  }
  default:
    console.error(
      'usage:\n' +
        '  xray reconstruct <bundle.zip|dir> --out <dir>\n' +
        '  xray install [--claude] [--codex] [--agents] [--all]\n' +
        '  xray uninstall [--claude] [--codex] [--agents]'
    );
    process.exit(1);
}
export {};
