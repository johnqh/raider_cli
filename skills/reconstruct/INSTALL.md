# Installing the xray reconstruct skill

The skill drives the `xray` CLI, so install both.

## 1. Install the CLI

From a clone of this repository:

```bash
cd ~/projects/xray_lib && bun install && bun run build
cd ~/projects/xray_cli && bun install
bun link
```

`bun link` registers the `xray` binary globally. Verify:

```bash
xray reconstruct
# usage: xray reconstruct <bundle.zip|dir> --out <dir>
```

If the linked binary is not on your PATH, invoke the entry point directly. The
skill works either way — substitute this wherever it says `xray`:

```bash
bun ~/projects/xray_cli/src/cli.ts reconstruct <bundle.zip> --out <dir>
```

## 2. Install the skill

Claude Code discovers personal skills in `~/.claude/skills/`. Symlink rather
than copy, so the skill tracks the repository:

```bash
mkdir -p ~/.claude/skills
ln -s ~/projects/xray_cli/skills/reconstruct ~/.claude/skills/xray-reconstruct
```

Verify it is discovered:

```bash
ls ~/.claude/skills/xray-reconstruct/SKILL.md
```

Then start a new Claude Code session — skills are read at session start. Ask it
to reconstruct a bundle, or invoke it by name with `/xray-reconstruct`.

## 3. Confirm end to end

```bash
xray reconstruct ~/projects/xray_cli/fixtures/bundles/react-sample.zip --out /tmp/rebuilt
cat /tmp/rebuilt/.xray/report.md
```

Expected: framework `react`, bundler `vite`, mode `recovery` at 100%, four
routes, and five endpoints — `/api/login`, `/api/me`, `/api/stats`,
`/api/users`, `/api/users/{id}`.

Then confirm the output actually runs:

```bash
cd /tmp/rebuilt && bun install && bun run build && bun run server/replay.ts
```

## Uninstalling

```bash
rm ~/.claude/skills/xray-reconstruct
cd ~/projects/xray_cli && bun unlink
```
