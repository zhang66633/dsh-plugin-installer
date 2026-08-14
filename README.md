# dsh-plugin-installer

> Install and troubleshoot plugins for **DeepSeek Harness (`dsh`)** — painlessly, even for complete beginners.

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![npm](https://img.shields.io/npm/v/dsh-plugin-installer)
![CI](https://github.com/zhang66633/dsh-plugin-installer/actions/workflows/ci.yml/badge.svg)
![dsh](https://img.shields.io/badge/dsh-0.1.0--rc.6-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Docs](https://img.shields.io/badge/docs-English%20%7C%20简体中文-informational)

[English](./README.md) · [简体中文](./README.zh-CN.md)

---

## What is this?

`dsh-plugin-installer` is a **skill** — an agent instruction package — that turns a DeepSeek Harness agent into a reliable plugin installer and error diagnostician. You describe the plugin you want; the agent understands the request, locates the source (npm or GitHub), picks the safest install path, installs, verifies, and reports back.

Everything here is **battle-tested**: every flow and edge case was validated in practice (2026-08) against the dsh `0.1.0-rc.6` ecosystem on a real machine.

## Why do you need it?

Installing dsh plugins by hand is full of traps that the official docs don't mention:

- The npm `latest` dist-tag still points at an old `0.0.1-rc.1` — range installs break.
- GitHub-cloned plugins carry no `node_modules` and need a **shared dependency layer** to resolve `@deepseek-ai/*` packages.
- `cordis.patch.yml` is a *patch layer* — a new plugin instance must be wrapped in `- insert:`, or it's silently skipped.
- The skin system (`@linxin666`) has upstream bugs that need version-conditional patches.
- pnpm 9.15 silently ignores `nodeLinker: hoisted`.

This skill encodes all of that so you don't have to relearn it.

## Features

- ✅ **npm direct install** with exact-version pinning (stale-dist-tag guard)
- ✅ **GitHub clone + register** with a one-command shared-dependency bootstrap
- ✅ **MCP server / skill / skin** installation paths
- ✅ **`patch-skins.sh`** — detect-before-patch, version-conditional, idempotent skin fixer
- ✅ **`diagnose.sh`** — one-shot "is my plugin installed correctly?" check
- ✅ **13-trap edge-case runbook** (`references/edge-cases.md`) with symptoms → root cause → fix
- ✅ **Beginner-safe**: stops at every key decision point to ask the user
- ✅ **Ships as a bundled skill-provider plugin** (`ctx.skills` provider; installable via `dsh plugin add`, catalog-ready)

## Quick start

### 1. Install the skill

**Route A — as a skill** (filesystem discovery, zero config):

```bash
git clone --depth 1 https://github.com/zhang66633/dsh-plugin-installer ~/.dsh/skills/dsh-plugin-installer
```

`dsh-skill-filesystem` auto-discovers skills under `~/.dsh/skills` — no registration or restart needed.

**Route B — as a bundled skill-provider plugin** (also makes the repo listable in the dsh-plugin catalog):

```bash
# published on npm as dsh-plugin-installer@1.1.0:
dsh plugin --profile <profile> add dsh-plugin-installer
# or link it for local development:
#   ~/.dsh/profiles/<profile>/package.json → "dependencies": { "dsh-plugin-installer": "link:<repo>" }
#   + add "dsh-plugin-installer" to dsh.profile.bundles
cd ~/.dsh/profiles/<profile> && pnpm install
```

Both routes expose the same skill; Route B registers it through a `ctx.skills` bundled provider, which also makes this repo eligible for the [awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins) 🎓 技能 catalog.

### 2. Ask your agent

> 「帮我装个 XX 插件」 / "install the XX plugin for me"

The skill takes over and walks through: understand the request → locate the source → choose the install path → install → verify → report.

## Tutorial — install a real plugin from GitHub

### Step 1 · Create the shared dependency layer (one-time)

Cloned plugins carry no `node_modules`. Node resolves dependencies by walking **up** from a module's real path, so a common ancestor directory holding a `node_modules` becomes the public resolution layer. Create it in one command:

```bash
bash <skill-dir>/scripts/bootstrap.sh
# plugins dir defaults to ~/.dsh/plugins; override with DSH_PLUGINS_DIR
```

This scaffolds `<plugins_dir>/package.json` from a verified template (all `@deepseek-ai/*` at `0.1.0-rc.6`, `cordis`/`schemastery` variants, `react-dom@18.3.1` to prevent the react 19 conflict) and runs `npm install`.

### Step 2 · Clone + inspect

```bash
git clone --depth 1 https://github.com/<owner>/<repo>.git <plugins_dir>/<name>
cd <plugins_dir>/<name>
node -e "const p=require('./package.json'); console.log(JSON.stringify({name:p.name, main:p.main, dsh:p.dsh, deps:p.dependencies},null,1))"
ls lib/ 2>/dev/null
```

Judgment:
- ✅ **Ready to register** — `dsh.bundle.patch` + `cordis.patch.yml` + `lib/index.js` present
- ⚠️ **Unbuilt** — `dsh.bundle` exists but `lib/` is empty → `npm install && npm run build`
- ❌ **Broken publish** — `lib/index.js` imports a missing chunk → skip or build from source

### Step 3 · Fill the shared deps

```bash
grep -rhoE "from ['\"]([^./][^'\"]*)" lib/ | sed "s/from ['\"]//" | sed 's#/.*##' | sort -u
cd <plugins_dir> && npm install   # after adding any missing deps to package.json
```

### Step 4 · Register in the profile

Edit `~/.dsh/profiles/<profile>/package.json` (profile defaults to `web`):

```jsonc
{
  "dependencies": {
    "<plugin-name>": "link:<plugins_dir>/<name>"
  },
  "dsh": {
    "profile": {
      "bundles": ["<plugin-name>"]
    }
  }
}
```

```bash
cd ~/.dsh/profiles/<profile> && pnpm install
```

### Step 5 · Verify

```bash
dsh --profile <profile> --dump-config 2>&1 | grep -A2 <name>   # appears in the tree
dsh web                                                       # boots clean
bash <skill-dir>/scripts/diagnose.sh <name>                    # full checklist
```

## Configuration

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DSH_PLUGINS_DIR` | `~/.dsh/plugins` | Where cloned plugins + the shared `node_modules` live |
| `DSH_PROFILE` | `web` | dsh profile to register plugins into |

### MCP servers

Add an MCP server in the profile's `cordis.patch.yml` — **always wrapped in `- insert:`**:

```yaml
- insert:
    - id: mcp-context7
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: context7
        transport: stdio
        command: npx
        args: ['-y', '@upstash/context7-mcp']
```

For HTTP servers, use `transport: streamable-http` + `url` (tokens via `!!js '`${process.env.XXX}`'`).

### Skins

`@linxin666/dsh-skins` has upstream bugs (skin bundles 404/500, apply 400). Fix in one shot with the version-conditional patcher:

```bash
bash <skill-dir>/scripts/patch-skins.sh          # detect → patch (idempotent)
bash <skill-dir>/scripts/patch-skins.sh --check  # report only
```

It never blind-patches: if upstream fixes the bug, re-running it detects that and skips.

## Uninstall

- **As a skill**: `rm -rf ~/.dsh/skills/dsh-plugin-installer`
- **As a plugin**: remove the dependency and the `dsh.profile.bundles` entry from `~/.dsh/profiles/<profile>/package.json`, then

  ```bash
  cd ~/.dsh/profiles/<profile> && pnpm install
  ```

## How it works

The core trick is the **shared dependency layer**. Plugins cloned from GitHub are symlinked into a profile via `link:`. At runtime, Node resolves each plugin's `@deepseek-ai/*` imports by walking up from the plugin's real path — so a single `<plugins_dir>/node_modules` at the common ancestor satisfies all of them. New plugins plug in by adding their missing deps to that one `package.json` and re-running `npm install`.

Patch management is **version-conditional**: each patch carries a marker in the installed file; the script detects *already patched* / *upstream fixed* / *needs patch* before touching anything, so upgrades and reinstalls converge on the next run.

## Compatibility

- **dsh ecosystem**: `0.1.0-rc.6` — **last verified 2026-08-14** (skill body + plugin load + `dsh --dump-config`). The npm `latest` tag is stale — always pin exact versions.
- **OS**: Windows (Git Bash), macOS, Linux — scripts are POSIX `bash`
- **pnpm**: 9.15 `nodeLinker` quirk handled (use `pnpm install --config.nodeLinker=hoisted` when you need hoisting)

## Repository layout

```
dsh-plugin-installer/
├── package.json                # plugin manifest (dsh.bundle.patch → cordis.patch.yml)
├── cordis.patch.yml            # patch layer: inserts the plugin instance
├── lib/
│   ├── index.js                # cordis plugin: registers the bundled skill provider
│   └── skills.js               # provider: scans skills/, parses SKILL.md frontmatter
├── skills/
│   └── dsh-plugin-installer/
│       └── SKILL.md            # the skill itself
├── references/
│   ├── install-flow.md         # full install procedures (npm / GitHub / MCP / skill / skin)
│   ├── edge-cases.md           # 13-trap runbook with fixes
│   ├── diagnostics.md          # error triage table + commands
│   └── github-access.md        # GitHub access strategy (git clone over curl)
├── scripts/
│   ├── bootstrap.sh            # scaffold the shared dependency layer
│   ├── patch-skins.sh          # version-conditional skin fixer
│   └── diagnose.sh             # plugin health check
└── templates/
    └── _plugins.package.json   # verified dependency template
```

## Permissions & data

This skill installs and manages dsh plugins on your machine. What it touches:

- **Files read/written**: your dsh profile (`~/.dsh/profiles/<profile>/package.json`), patch layers (`~/.dsh/cordis.patch.yml`), and plugin directories under `<plugins_dir>`. It edits profile manifests to register plugins.
- **Network**: npm registry (install/update plugins) and GitHub (git clone for source plugins). No analytics, no telemetry.
- **Credentials**: none stored — it never reads `.credentials.yaml` or any API keys.
- **Execution**: the bundled scripts (`bootstrap.sh`, `patch-skins.sh`, `diagnose.sh`) run shell commands (`npm`, `pnpm`, `git`, `node`) on your machine.

It is a local, user-controlled tool: nothing runs without your go-ahead at a 🔴 decision point.

## Troubleshooting

- Run `bash <skill-dir>/scripts/diagnose.sh <plugin>` for a structured health check.
- Consult `references/edge-cases.md` for symptoms → root cause → fix on 13 real traps (stale dist-tags, pnpm nodeLinker, `- insert:` requirement, broken publishes, GitHub SSL, missing `httpServer`, skin bugs, and more).
- Hit something new? Add it to `edge-cases.md` — the skill is a living runbook.

## Contributing

Found a new trap or a better fix? PRs welcome. Keep the three-part format (symptom → root cause → fix) in `references/edge-cases.md`, and update the version table in the skin section when upstream moves.

## License & security

[MIT](./LICENSE) © 2026 zhang66633

To report a security issue privately, open a GitHub security advisory on this repo rather than a public issue.
