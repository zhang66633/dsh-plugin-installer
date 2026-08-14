# dsh-plugin-installer

> A **plugin store + install assistant** for DeepSeek Harness (`dsh`): browse the plugin catalog in the Web GUI, confirm an install with one click, and let the agent finish it for you.

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![npm](https://img.shields.io/npm/v/dsh-plugin-installer)
![CI](https://github.com/zhang66633/dsh-plugin-installer/actions/workflows/ci.yml/badge.svg)
![dsh](https://img.shields.io/badge/dsh-0.1.0--rc.6-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Docs](https://img.shields.io/badge/docs-English%20%7C%20简体中文-informational)

[English](./README.md) · [简体中文](./README.zh-CN.md)

---

## Overview

`dsh-plugin-installer` is a **dual-face plugin** for dsh. One package provides two things:

1. **Plugin store**: a 「插件商店」 tab in the Web GUI session view ring — browse and search the plugin catalog (name / description / original link / stars); clicking 安装 asks for confirmation first, then submits the install request.
2. **Install assistant skill**: a bundled skill the agent follows to complete an install — verify the source, pick the install path, register into the profile, verify the result. Every step is explainable and reversible.

**Who it is for**: anyone who wants to discover and install dsh plugins from the UI; developers who want the agent to handle installation and troubleshooting reliably.

## Compatibility

| Item | Support |
| --- | --- |
| dsh ecosystem | `0.1.0-rc.6` (last verified 2026-08) |
| OS | Windows / macOS / Linux |
| Node | ≥ 22.19 |
| Surface | Web GUI (`dsh --profile web`); non-GUI profiles should use Route B (skill only) |

## Install / Uninstall

### Install

**Route A — full plugin (store tab + skill)**, once published to npm:

```bash
dsh plugin --profile web add dsh-plugin-installer
```

Local development via link:

```jsonc
// ~/.dsh/profiles/web/package.json
{
  "dependencies": { "dsh-plugin-installer": "link:<repo path>" },
  "dsh": { "profile": { "bundles": ["dsh-plugin-installer"] } }
}
```

```bash
cd ~/.dsh/profiles/web && pnpm install
```

**Route B — skill only** (filesystem discovery, no store UI):

```bash
git clone --depth 1 https://github.com/zhang66633/dsh-plugin-installer ~/.dsh/skills/dsh-plugin-installer
```

### Upgrade

- Route A: re-run `dsh plugin add` (pin the version); for local links, `git pull` and rebuild.
- Route B: `git pull`.

### Disable

Remove `dsh-plugin-installer` from `dsh.profile.bundles` (the dependency may stay).

### Uninstall

Remove the dependency and the bundle entry from the profile `package.json`, then `pnpm install`; for Route B, delete `~/.dsh/skills/dsh-plugin-installer`.

## Quick start

1. Install, then restart `dsh web`.
2. Open any session — the **plugin store** tab appears in the view ring (next to chat/trajectory).
3. Search for a plugin (e.g. `vision`), click **安装**, confirm the prompt, and the current session's agent takes over the install.
4. Restart `dsh web` after the install completes.

Minimal reproducible example: search `modlens` → click install → confirm → the agent reports success → restart → send an image to test OCR.

## Configuration

- **Store data**: `data/store.json` is a catalog snapshot (name / description / original link / category / stars) shipped with the package; no network fetch at runtime. Refresh = rebuild the snapshot and reinstall.
- **Install request**: clicking 安装 only POSTs a JSON request (plugin name + session id) to the local `/plugin-store/install` route; the actual install is performed by the current session's agent.
- No other config, no environment variables, no secrets.

## Permissions & data

- Host process: **read-only** access to the bundled `data/store.json`; the catalog and install routes bind to the local web server only.
- After an install is triggered, the **agent** runs the install commands (it may read/write your dsh profile and plugin directories, and reach npm / GitHub) — every step is visible and can be stopped.
- No telemetry, no analytics, no credential access.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Store tab missing | Confirm `dsh.profile.bundles` includes `dsh-plugin-installer`; check `dsh --profile web --dump-config`; restart |
| 安装 does nothing | Confirm the session has a live agent; check the `/plugin-store/install` response in the browser console |
| Rollback | Remove the bundle entry and run `pnpm install` — the rest of the profile is untouched |

## Development

```bash
npm install          # build tooling (esbuild)
npm run build        # build lib/client.js (client wire bundle)
npm run check        # script syntax/standards checks
npm test             # unit tests
npm run smoke        # smoke: load lib/index.js and print name/inject
```

Store snapshot refresh: update `data/store.json`, rebuild, and reinstall. Pull requests welcome; keep README and tests in sync with behavior changes.

## License & security

[MIT](./LICENSE) © 2026 zhang66633

Report security issues privately via a GitHub **security advisory**, not a public issue.
