import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  auditLinks,
  buildApiModel,
  buildRouteModel,
  deriveTimeline,
  endpointKey,
  generateClient,
  generateProject,
  generateReplayServer,
  generateTypes,
  parseSourceMap,
  recoverSources,
  recoveryRatio,
  type EndpointSample,
  type StackFingerprint,
} from '@sudobility/xray_lib';
import { loadBundle } from '../bundle/load';
import { unpackChunks } from '../stages/unpack';
import { emitMirror } from '../stages/mirror';
import { emitFiles } from '../emit';

export interface ReconstructReport {
  recoveryRatio: number;
  unreachablePages: number;
  mode: 'recovery' | 'inference' | 'mirror';
  mirroredFiles: number;
  pages: number;
  routes: number;
  endpoints: number;
  gaps: number;
  filesWritten: number;
}

const RECOVERY_THRESHOLD = 80;

/**
 * CDP labels every request with what the page asked it for. That is a far more
 * reliable signal than guessing from the URL: an SPA route like `/users` has no
 * file extension, so an extension-based filter counts HTML navigations as API
 * calls and generates client methods for them.
 */
const API_RESOURCE_TYPES = new Set(['XHR', 'Fetch']);

function isApiCall(request: { url: string; method: string; resourceType: string }): boolean {
  // CORS preflights are transport, not API surface; the browser sends them, the
  // application never calls them.
  if (request.method === 'OPTIONS') return false;
  return API_RESOURCE_TYPES.has(request.resourceType);
}

export async function reconstruct(options: {
  bundlePath: string;
  outDir: string;
}): Promise<ReconstructReport> {
  const bundle = await loadBundle(options.bundlePath);
  const xrayDir = join(options.outDir, '.xray');
  await mkdir(xrayDir, { recursive: true });

  const writeJson = (name: string, value: unknown) =>
    writeFile(join(xrayDir, name), JSON.stringify(value, null, 2), 'utf8');

  // Stage 1 — bundle summary, gaps first.
  await writeJson('01-bundle.json', {
    manifest: bundle.manifest,
    gaps: bundle.gaps,
    redaction: bundle.redaction,
  });

  // Stage 2 — source-map recovery.
  const recovered: Record<string, string> = {};
  let mappedBytes = 0;
  let totalJsBytes = 0;
  for (const request of bundle.requests) {
    if (!request.mimeType?.includes('javascript') || !request.responseBodyHash) continue;
    const size = bundle.content.get(request.responseBodyHash)?.byteLength ?? 0;
    totalJsBytes += size;

    const mapHash = bundle.sourceMaps[request.url];
    if (!mapHash) continue;
    const mapText = bundle.text(mapHash);
    if (mapText === null) continue;
    const map = parseSourceMap(mapText);
    if (!map) continue;

    mappedBytes += size;
    for (const file of recoverSources(map)) recovered[file.path] = file.content;
  }

  const ratio = recoveryRatio({ mappedBytes, totalBytes: totalJsBytes });
  if (Object.keys(recovered).length > 0) {
    await emitFiles(join(xrayDir, '02-sources'), recovered);
  }

  // Stage 3 — unpack whenever source maps did not carry the day.
  if (ratio < RECOVERY_THRESHOLD) {
    const chunks = await unpackChunks(bundle);
    const files: Record<string, string> = {};
    chunks.forEach((chunk, index) => {
      files[`chunk-${index}.js`] = chunk.source;
      for (const module of chunk.modules) {
        files[`chunk-${index}/module-${module.id}.js`] = module.source;
      }
    });
    await emitFiles(join(xrayDir, '03-chunks'), files);
  }

  // Stage 4 — API model, plus the recordings the replay server serves.
  const samples: EndpointSample[] = [];
  const recordings: Record<
    string,
    Array<{ status: number; headers: Record<string, string>; body: unknown }>
  > = {};

  for (const request of bundle.requests) {
    if (!isApiCall(request)) continue;
    samples.push({
      method: request.method,
      url: request.url,
      status: request.status,
      requestBody:
        request.requestBodyHash === null ? null : bundle.json(request.requestBodyHash),
      responseBody:
        request.responseBodyHash === null
          ? undefined
          : bundle.json(request.responseBodyHash),
      requestHeaders: request.requestHeaders,
    });
  }

  const api = buildApiModel(samples);
  await writeJson('04-api-model.json', api);

  for (const sample of samples) {
    if (sample.responseBody === undefined) continue;
    // Re-derive the same key the model used. Substring matching on the template
    // would mis-bucket /api/users against /api/users/{id}.
    const key = endpointKey(sample.method, sample.url);
    const bucket = recordings[key] ?? [];
    bucket.push({ status: sample.status ?? 200, headers: {}, body: sample.responseBody });
    recordings[key] = bucket;
  }
  await writeJson('recordings.json', recordings);

  // Stage 5 — route model.
  //
  // A client-side router hands us its route table, and the extension stamps a
  // navigationId per row. Neither exists for a server-rendered or multi-page
  // site. When they are missing, recover both from the request timeline: every
  // Document request is a navigation, and what follows it belongs to that page.
  const runtimeRoutes = (bundle.runtime.routes as string[]) ?? [];
  const runtimeNavigations =
    (bundle.runtime.navigations as Array<{ navigationId: string; path: string }>) ?? [];

  const derived = deriveTimeline(bundle.requests);
  const usingDerived = runtimeRoutes.length === 0 || runtimeNavigations.length === 0;

  const routeModel = buildRouteModel({
    routes: usingDerived ? derived.navigations.map((n) => n.path) : runtimeRoutes,
    navigations: usingDerived ? derived.navigations : runtimeNavigations,
    requests: bundle.requests.map((r) => ({
      method: r.method,
      url: r.url,
      navigationId: usingDerived ? (derived.assignments[r.id] ?? null) : r.navigationId,
      resourceType: r.resourceType,
    })),
  });
  await writeJson('05-route-model.json', {
    ...routeModel,
    source: usingDerived ? 'derived-from-documents' : 'runtime-router-table',
  });

  // Stage 5b — the mirror. Always written: these are the served bytes, with no
  // inference involved at all.
  const mirror = await emitMirror(bundle, join(options.outDir, 'public'));
  await writeJson('06-mirror.json', {
    filesWritten: mirror.filesWritten,
    pages: mirror.pages,
    bytes: mirror.bytes,
    fromSnapshot: mirror.fromSnapshot,
  });

  // Stage 5c — link audit. Everything else verifies what the capture contains;
  // this is the only stage that asks what it is missing. A reconstruction whose
  // own navigation 404s is not finished, and no other check would notice.
  const linkAudit = auditLinks({
    pages: mirror.documents,
    available: mirror.paths,
  });
  await writeJson('07-link-audit.json', linkAudit);

  // With no source maps and no client router, there is no component tree to
  // reconstruct — the components ran on the server and were never sent. The
  // honest artifact is the mirror plus a replay server, not a fabricated SPA.
  const mode: ReconstructReport['mode'] =
    ratio >= RECOVERY_THRESHOLD
      ? 'recovery'
      : runtimeRoutes.length === 0 && mirror.pages.length > 0
        ? 'mirror'
        : 'inference';
  await writeJson('02-recovery.json', {
    ratio,
    mode,
    files: Object.keys(recovered).sort(),
  });

  // Stages 6–7 — stack decision and deterministic codegen.
  const stack: StackFingerprint = bundle.manifest.stack ?? {
    framework: 'unknown',
    frameworkVersion: null,
    router: null,
    routerVersion: null,
    stateLibraries: [],
    bundler: 'unknown',
  };

  const project: Record<string, string> =
    mode === 'mirror'
      ? mirrorProject({ origin: bundle.manifest.origin, stack, mirror, gaps: bundle.gaps })
      : generateProject({
          name: 'rebuilt',
          stack,
          routes: routeModel.routes,
          api,
          gaps: bundle.gaps,
        });

  project['src/api/types.ts'] = generateTypes(api);
  project['src/api/client.ts'] = generateClient(api);
  project['server/replay.ts'] =
    mode === 'mirror' ? mirrorServer(api) : generateReplayServer(api);
  project['server/recordings.json'] = JSON.stringify(recordings, null, 2);

  const filesWritten = await emitFiles(options.outDir, project);

  const missingPages = linkAudit.unreachable.filter((u) => u.kind === 'page');
  const report: ReconstructReport = {
    recoveryRatio: ratio,
    unreachablePages: missingPages.length,
    mode,
    mirroredFiles: mirror.filesWritten,
    pages: mirror.pages.length,
    routes: routeModel.routes.length,
    endpoints: api.endpoints.length,
    gaps: bundle.gaps.length,
    filesWritten,
  };

  await writeFile(
    join(xrayDir, 'report.md'),
    [
      '# xray reconstruction report',
      '',
      `- Origin: ${bundle.manifest.origin}`,
      `- Framework: ${stack.framework} ${stack.frameworkVersion ?? '(version unknown)'}`,
      `- Bundler: ${stack.bundler}`,
      `- Mode: **${mode}** (source-map recovery ${ratio}%)`,
      `- Mirrored: ${mirror.filesWritten} files, ${(mirror.bytes / 1048576).toFixed(1)} MB, ${mirror.pages.length} pages`,
      ...(mirror.fromSnapshot.length > 0
        ? [
            `- Of those, ${mirror.fromSnapshot.length} pages come from rendered-DOM`,
            '  snapshots rather than served bytes — the server never sent HTML for',
            '  them, so this is the post-hydration DOM, not source.',
          ]
        : []),
      `- Route source: ${usingDerived ? 'derived from Document requests' : 'runtime router table'}`,
      `- Routes: ${routeModel.routes.length} (${routeModel.routes.filter((r) => !r.visited).length} never visited)`,
      `- Endpoints: ${api.endpoints.length}`,
      `- Gaps: ${bundle.gaps.length}`,
      `- Unreachable internal links: ${missingPages.length} pages, ${linkAudit.unreachable.length - missingPages.length} assets`,
      '',
      '## Routes',
      '',
      ...routeModel.routes.map(
        (r) =>
          `- \`${r.path}\`${r.visited ? '' : ' — **never visited**'}${
            r.endpoints.length > 0 ? ` → ${r.endpoints.join(', ')}` : ''
          }`
      ),
      '',
      '## Linked but never captured',
      '',
      ...(linkAudit.unreachable.length > 0
        ? [
            'These are linked from captured pages but are not in the bundle.',
            'Re-capture visiting them, or the reconstruction ships broken navigation.',
            '',
            ...linkAudit.unreachable.map(
              (u) => `- \`${u.link}\` (${u.kind}) — linked from ${u.linkedFrom.join(', ')}`
            ),
          ]
        : ['(none — every internal link resolves)']),
      '',
      '## Pages',
      '',
      ...(mirror.pages.length > 0 ? mirror.pages.map((p) => `- \`${p}\``) : ['(none)']),
      '',
      '## Unattributed endpoints',
      '',
      ...(routeModel.unattributed.length > 0
        ? routeModel.unattributed.map((e) => `- ${e}`)
        : ['(none)']),
    ].join('\n'),
    'utf8'
  );

  return report;
}

function mirrorProject(input: {
  origin: string;
  stack: StackFingerprint;
  mirror: { filesWritten: number; pages: string[]; bytes: number };
  gaps: Array<{ reason: string; url: string; detail: string | null }>;
}): Record<string, string> {
  const files: Record<string, string> = {};

  files['package.json'] = JSON.stringify(
    {
      name: 'mirror',
      private: true,
      type: 'module',
      scripts: { serve: 'bun run server/replay.ts' },
      dependencies: { hono: '^4.6.0' },
    },
    null,
    2
  );

  const readme: Array<string | null> = [
    `# ${new URL(input.origin).host} — reconstruction`,
    '',
    `Rebuilt by xray from a capture of ${input.origin}.`,
    '',
    '## What this is',
    '',
    `The site was rendered on the server and shipped no source maps, so its`,
    `component source never reached the browser and cannot be recovered. What`,
    `*was* received is here in full: ${input.mirror.filesWritten} files`,
    `(${(input.mirror.bytes / 1048576).toFixed(1)} MB) across ${input.mirror.pages.length} pages,`,
    'byte-identical to what the server sent.',
    '',
    `Detected stack: ${input.stack.framework}${input.stack.frameworkVersion ? ` ${input.stack.frameworkVersion}` : ''}`,
    input.stack.stateLibraries.length > 0
      ? `State libraries: ${input.stack.stateLibraries.join(', ')}`
      : null,
    '',
    '## Run it',
    '',
    '```bash',
    'bun install',
    'bun run serve   # http://localhost:8787',
    '```',
    '',
    'Static files are served from `public/`. API calls are replayed from',
    '`server/recordings.json`; anything never captured returns 501 rather than',
    'a plausible invention.',
    '',
    '## What is not here',
    '',
    '- Server component source — it ran on the server and was never sent.',
    '- Any behaviour behind an endpoint the capture did not exercise.',
    input.gaps.length > 0
      ? `- ${input.gaps.length} resources listed in XRAY-GAPS.md.`
      : null,
    '',
    '## Pages',
    '',
    ...input.mirror.pages.map((p) => `- \`${p}\``),
    '',
  ];
  files['README.md'] = readme
    .filter((line): line is string => line !== null)
    .join('\n');

  if (input.gaps.length > 0) {
    files['XRAY-GAPS.md'] = [
      '# Capture gaps',
      '',
      'Requested by the site but not captured. Anything depending on these is',
      'missing evidence, not merely unimplemented.',
      '',
      ...input.gaps.map(
        (gap) => `- \`${gap.reason}\` — ${gap.url}${gap.detail ? ` (${gap.detail})` : ''}`
      ),
      '',
    ].join('\n');
  }

  return files;
}

function mirrorServer(api: Parameters<typeof generateReplayServer>[0]): string {
  // The mirror lives in public/, not dist/, and extensionless pages were
  // written as <path>/index.html — so the fallback resolves them there.
  return generateReplayServer(api)
    .replace("serveStatic({ root: './dist' })", "serveStatic({ root: './public' })")
    .replace(
      "app.get('*', serveStatic({ path: './dist/index.html' }));",
      "app.get('*', (c, next) =>\n" +
        "  serveStatic({\n" +
        "    path: `./public${new URL(c.req.url).pathname.replace(/\\/$/, '')}/index.html`,\n" +
        "  })(c, next)\n" +
        ');'
    );
}

export async function runReconstruct(argv: string[]): Promise<void> {
  const bundlePath = argv[0];
  const outIndex = argv.indexOf('--out');
  const outDir = outIndex >= 0 ? argv[outIndex + 1] : undefined;

  if (!bundlePath || !outDir) {
    console.error('usage: xray reconstruct <bundle.zip|dir> --out <dir>');
    process.exit(1);
  }

  const report = await reconstruct({ bundlePath, outDir });
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nArtifacts: ${join(outDir, '.xray')}`);
  console.log(`Report:    ${join(outDir, '.xray', 'report.md')}`);
}
