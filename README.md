# xray_cli

Command-line reconstruction for [xray](../xray_lib) capture bundles, plus the
Claude Code `reconstruct` skill that drives it.

**Status: not yet implemented.** This repository exists to hold the boundary.
Its contents arrive with milestones 5–8 of the xray design, which are
deliberately deferred until there are real captured bundles to build against.

## Why this is a separate repository

`xray_lib` is imported by `xray_extension`, which ships into a Chrome MV3
bundle. Its defining constraint is that it performs no I/O — no filesystem, no
`DOM` in its tsconfig `lib` — which is what keeps it trivially testable and
safe to bundle for the browser.

A CLI is the opposite: it needs `fs`, `path`, `process`, and zip extraction.
Putting that in `xray_lib` would place Node-only code in the dependency graph
of a browser artifact and would end the mechanical enforcement of that purity.

So the dependency shape is a diamond, not a chain:

```
xray_lib              pure: bundle format, redaction, coverage, inference
   ├── xray_extension   browser: CDP capture, offscreen buffer, side panel
   └── xray_cli         node: unzip, filesystem, codegen + the reconstruct skill
```

The two consumers never see each other.

## Planned surface

```bash
xray reconstruct <bundle.zip|dir> --out <dir>
```

The CLI owns the deterministic stages of the design — source-map recovery,
bundle unpacking, JSON Schema inference, route modelling, project scaffold, and
the Hono replay server — writing intermediate JSON artifacts to disk at each
stage. The `reconstruct` skill reads those artifacts and does only the work
that needs judgment: implementing components, naming things, wiring routes.

That split is what keeps the system testable. Everything the CLI does is
covered by `bun test`; only genuinely model-shaped work lives in prose.

## Related

- [`xray_lib`](../xray_lib) — bundle format and pure analysis; design spec and plans live in `docs/superpowers/`
- [`xray_extension`](../xray_extension) — the capture extension

## License

BUSL-1.1
