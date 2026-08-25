import { expect, test } from 'bun:test';
import { loadBundle } from '../../src/bundle/load';

const REACT = `${import.meta.dir}/../../fixtures/bundles/react-sample.zip`;

test('loads a real captured bundle from a zip', async () => {
  const bundle = await loadBundle(REACT);
  expect(bundle.manifest.formatVersion).toBe(1);
  expect(bundle.manifest.stack?.framework).toBe('react');
  expect(bundle.requests.length).toBeGreaterThan(5);
});

test('resolves body hashes to text', async () => {
  const bundle = await loadBundle(REACT);
  const apiCall = bundle.requests.find((r) => r.url.includes('/api/users'));
  expect(apiCall).toBeDefined();
  const body = bundle.json(apiCall!.responseBodyHash!);
  expect(body).toBeDefined();
});

test('returns null for an unknown hash rather than throwing', async () => {
  const bundle = await loadBundle(REACT);
  expect(bundle.text('nonexistent')).toBeNull();
});

test('rejects a bundle whose formatVersion is unsupported', async () => {
  await expect(
    loadBundle(`${import.meta.dir}/fixtures/badversion`)
  ).rejects.toThrow(/formatVersion/);
});

test('exposes gaps so later stages can see what is missing', async () => {
  const bundle = await loadBundle(REACT);
  expect(Array.isArray(bundle.gaps)).toBe(true);
});

test('reads runtime artifacts including navigations', async () => {
  const bundle = await loadBundle(REACT);
  expect((bundle.runtime.routes as string[]).length).toBeGreaterThan(0);
  const navigations = bundle.runtime.navigations as Array<{ path: string }>;
  expect(navigations.length).toBeGreaterThan(0);
});

test('resolves source maps to parseable JSON', async () => {
  const bundle = await loadBundle(REACT);
  const [hash] = Object.values(bundle.sourceMaps);
  expect(hash).toBeDefined();
  const map = bundle.json(hash!) as { sourcesContent?: unknown[] };
  expect(Array.isArray(map.sourcesContent)).toBe(true);
});
