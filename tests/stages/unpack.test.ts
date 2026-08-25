import { expect, test } from 'bun:test';
import { beautify, splitWebpackModules } from '../../src/stages/unpack';

test('beautifies minified javascript', async () => {
  const out = await beautify('const a=1;function b(){return a+1}');
  expect(out).toContain('function b()');
  expect(out.split('\n').length).toBeGreaterThan(1);
});

test('returns the original source when it cannot be parsed', async () => {
  const broken = 'const = = =';
  expect(await beautify(broken)).toBe(broken);
});

test('splits a webpack module registry by id', () => {
  const chunk =
    '(self.webpackChunk=self.webpackChunk||[]).push([[47],{' +
    '312:(e,t,n)=>{n.d(t,{A:()=>r});const r=1},' +
    '918:(e,t,n)=>{t.A=2}' +
    '}]);';
  const modules = splitWebpackModules(chunk);
  expect(modules.map((m) => m.id)).toEqual(['312', '918']);
  expect(modules[0]!.source).toContain('n.d(t,');
});

test('returns no modules for a flat rollup chunk', () => {
  expect(splitWebpackModules('import{a}from"./x.js";export const b=a+1;')).toEqual([]);
});
