import { $ } from 'bun';

const APPS = ['react-sample', 'vue-sample'];

for (const app of APPS) {
  const dir = `${import.meta.dir}/../fixtures/apps/${app}`;
  console.log(`building ${app}`);
  await $`bun install`.cwd(dir);
  await $`bun run build`.cwd(dir);
}
