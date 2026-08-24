import { expect, test } from 'bun:test';

test('cli probes are identical to the extension probes', async () => {
  const cli = await Bun.file(`${import.meta.dir}/../../src/introspect/probes.ts`).text();
  const ext = await Bun.file(
    `${import.meta.dir}/../../../xray_extension/src/introspect/probes.ts`
  ).text();
  expect(cli).toBe(ext);
});
