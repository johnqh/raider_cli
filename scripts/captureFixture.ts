import { captureApp } from '../src/capture/harness';
import { startFixtureApi } from '../fixtures/api/server';

const APPS = [
  { name: 'react-sample', routes: ['/', '/users', '/users/1', '/stats'] },
  { name: 'vue-sample', routes: ['/', '/users', '/users/1', '/stats'] },
];

const api = startFixtureApi(8123);
try {
  for (const app of APPS) {
    console.log(`capturing ${app.name}`);
    const zipped = await captureApp({
      appDir: `${import.meta.dir}/../fixtures/apps/${app.name}/dist`,
      routes: app.routes,
      outName: app.name,
    });
    await Bun.write(`${import.meta.dir}/../fixtures/bundles/${app.name}.zip`, zipped);
    console.log(`  wrote ${zipped.byteLength} bytes`);
  }
} finally {
  api.stop();
}
