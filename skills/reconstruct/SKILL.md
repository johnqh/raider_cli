---
name: xray-reconstruct
description: Use when rebuilding a web application from an xray capture bundle, when handed an xray-*.zip of captured traffic, or when asked to reverse engineer a site from its recorded network activity and JavaScript.
---

# Reconstructing an app from an xray bundle

## Overview

An xray bundle holds everything a running web app served: its JavaScript, its
HTML, its API traffic, its source maps where they existed, and an explicit list
of what the capture missed. The `xray` CLI performs every deterministic stage.
Your job is the part it cannot do — turning recovered or minified source into
readable components wired to real routes.

**Core principle: the bundle is evidence, not inspiration.** Everything you
write must trace to something in it. Where the bundle is silent, say so.

## When to Use

- A `.zip` produced by the xray capture extension, or an unpacked bundle directory
- A request to rebuild, clone, or reverse engineer an app from captured traffic
- Re-running a reconstruction with better judgment against an existing bundle

Not for: capturing traffic (that is the extension), or analyzing a HAR file
(wrong format — `validateManifest` rejects it).

## Procedure

**1. Run the CLI first. Always.**

```bash
xray reconstruct <bundle.zip> --out <dir>
```

It writes the project and, under `<dir>/.xray/`, the artifacts you work from.
Do not read the raw bundle before running it — the artifacts are the same data,
already clustered, typed, and de-duplicated.

**2. Read `<dir>/.xray/report.md`.**

It names the framework, the reconstruction mode, the routes (including which
were never visited), the endpoints, and the gap count. What you do next depends
on the mode:

| Mode | Meaning | What you do |
|---|---|---|
| `recovery` | Source maps covered ≥80% of the JS | Copy real original sources from `.xray/02-sources/` into the project. This is recovery, not inference — do not paraphrase them. |
| `inference` | Little or no source-map coverage | Read `.xray/03-chunks/` and write components that reproduce observed behavior. |

**3. Implement one route at a time.**

For each route in `.xray/05-route-model.json`, work through it alone rather than
holding the whole app in context. The route entry names the endpoints that fired
while it was mounted — those, and only those, are its data dependencies. Call
them through the generated client in `src/api/client.ts`; never re-derive fetch
calls by hand, and never invent an endpoint the model does not list.

**4. Honor the gaps.**

`.xray/01-bundle.json` lists what the capture missed, and `XRAY-GAPS.md` in the
project repeats it. A route marked `visited: false` has no runtime evidence
behind it. Leave its `XRAY-GAP` comment in place and implement only the shell
the router requires. Deleting a gap marker because the page looks empty without
it is the one thing that turns a reconstruction into a fabrication.

**5. Verify before reporting.**

```bash
cd <dir> && bun install && bun run typecheck && bun run build
bun run server/replay.ts   # then exercise each route
```

The replay server answers captured endpoints with real recorded bodies and
returns 501 `XRAY-GAP` for anything never captured. A 501 is information, not a
bug to work around.

A reconstruction that does not build is not finished. Report the build output,
not your expectation of it.

## Quick Reference

| Artifact | Holds |
|---|---|
| `.xray/report.md` | Start here: mode, routes, endpoints, gaps |
| `.xray/02-sources/` | Recovered original files (recovery mode) |
| `.xray/03-chunks/` | Beautified chunks (inference mode) |
| `.xray/04-api-model.json` | Endpoints, per-status schemas, auth style |
| `.xray/05-route-model.json` | Routes, params, visited flag, endpoints per route |
| `.xray/recordings.json` | Real captured responses the replay server serves |

## Common Mistakes

| Mistake | Why it is wrong |
|---|---|
| Reading the raw zip instead of running the CLI | The artifacts are the same data, already analyzed. Re-deriving them wastes context and produces worse results. |
| Writing an endpoint absent from the API model | Endpoints come from observed traffic. One that is not in the model was never called; you are inventing an API. |
| Filling in a never-visited route with plausible content | There is no evidence for it. The `XRAY-GAP` marker is the honest output. |
| Hand-writing `fetch` calls | The generated client is typed from real payloads. Bypassing it discards the schema work. |
| Reporting success without building | Generated code that typechecks in your head is not a deliverable. |
| Treating a redaction placeholder as a real value | `<JWT:a1b2>` marks where a credential was. The same placeholder in two places means it was the same credential — that is the auth flow, not a literal. |
| Editing generated output to make a test pass | The generators are the source of truth. Patch the generator, then re-run; hand-edits vanish on the next reconstruction. |
