import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildApiModel,
  buildRouteModel,
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
import { emitFiles } from '../emit';

export interface ReconstructReport {
  recoveryRatio: number;
  mode: 'recovery' | 'inference';
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
  const mode: 'recovery' | 'inference' =
    ratio >= RECOVERY_THRESHOLD ? 'recovery' : 'inference';
  await writeJson('02-recovery.json', {
    ratio,
    mode,
    files: Object.keys(recovered).sort(),
  });
  if (Object.keys(recovered).length > 0) {
    await emitFiles(join(xrayDir, '02-sources'), recovered);
  }

  // Stage 3 — unpack only when recovery did not carry the day.
  if (mode === 'inference') {
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
  const navigations =
    (bundle.runtime.navigations as Array<{ navigationId: string; path: string }>) ?? [];
  const routeModel = buildRouteModel({
    routes: (bundle.runtime.routes as string[]) ?? [],
    navigations,
    requests: bundle.requests.map((r) => ({
      method: r.method,
      url: r.url,
      navigationId: r.navigationId,
      resourceType: r.resourceType,
    })),
  });
  await writeJson('05-route-model.json', routeModel);

  // Stages 6–7 — stack decision and deterministic codegen.
  const stack: StackFingerprint = bundle.manifest.stack ?? {
    framework: 'unknown',
    frameworkVersion: null,
    router: null,
    routerVersion: null,
    stateLibraries: [],
    bundler: 'unknown',
  };

  const project = generateProject({
    name: 'rebuilt',
    stack,
    routes: routeModel.routes,
    api,
    gaps: bundle.gaps,
  });
  project['src/api/types.ts'] = generateTypes(api);
  project['src/api/client.ts'] = generateClient(api);
  project['server/replay.ts'] = generateReplayServer(api);
  project['server/recordings.json'] = JSON.stringify(recordings, null, 2);

  const filesWritten = await emitFiles(options.outDir, project);

  const report: ReconstructReport = {
    recoveryRatio: ratio,
    mode,
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
      `- Routes: ${routeModel.routes.length} (${routeModel.routes.filter((r) => !r.visited).length} never visited)`,
      `- Endpoints: ${api.endpoints.length}`,
      `- Gaps: ${bundle.gaps.length}`,
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
