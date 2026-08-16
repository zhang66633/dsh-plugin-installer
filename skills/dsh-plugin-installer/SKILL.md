---
name: dsh-plugin-installer
description: 帮助用户（含完全小白）在 DeepSeek Harness（dsh）里安装插件：从 npm 直装或从 GitHub 克隆源码注册，处理全部已知坑（stale dist-tag、pnpm nodeLinker、cordis.patch.yml insert、坏发布、撞名、peer 冲突、GitHub 访问 SSL、mstar 扩展错配等），并在关键决策点停下来询问用户。触发：装插件 / 安装 dsh 插件 / 加个工具插件 / 插件装不上 / dsh 报错排查。
---

# DSH 插件安装器（dsh-plugin-installer）

在 DeepSeek Harness（`dsh`）里给用户安装插件，并诊断安装/运行报错。面向完全小白：每一步解释清楚，关键决策点停下来问用户再动手。

> 本文档沉淀了**已验证**的安装流程和全部踩过的坑（2026-08 实践）。遵循它，不要凭空发明步骤。深度参考见 `<技能目录>/references/` 目录，按需读取。`<技能目录>` = 本技能所在目录（插件包根目录）。

## 何时使用

- 用户要求"装个插件 / 加个工具 / 安装 X"
- 插件装不上、报错、dsh 启动失败
- 需要排查浏览器控制台报错、`dsh` boot 报错

## 核心事实（先记住，别绕路）

| 事实 | 结论 |
|---|---|
| `git clone` 直连 github.com **可用** | 下载 GitHub 插件用 git clone，**不要用 curl** |
| `curl` 到 github.com 报 **exit 35 SSL 错**（走坏代理） | 一切 GitHub 下载优先 git，其次 jsDelivr |
| npm registry（npmmirror）可用；**`latest` dist-tag 是旧的 `0.0.1-rc.1`** | **必须钉精确版本**（`0.1.0-rc.6`），用范围会装错 |
| dsh 插件分两类装法 | npm 直装（`dsh plugin add`）或 GitHub clone + link 注册 |
| 插件目录从不自带 node_modules | clone 源码后要靠**共享 `<plugins_dir>/node_modules`** 解析依赖 |
| `cordis.patch.yml` 是 patch 层 | **新增插件实例必须包在 `- insert:` 里**，顶层裸条目会被静默跳过 |
| dsh 读两层 patch | home 级 `~/.dsh/cordis.patch.yml`（全局）+ profile 级 `~/.dsh/profiles/<profile>/cordis.patch.yml` |
| 已打补丁可能被上游修复 | 补丁**版本条件化**：检测先于打补丁，重跑 `<技能目录>/scripts/patch-skins.sh` 自动收敛，不盲打 |
| 路径可配置 | 插件目录 `<plugins_dir>` 默认 `~/.dsh/plugins`（`DSH_PLUGINS_DIR` 覆盖）；profile `<profile>` 默认 `web`（`DSH_PROFILE` 覆盖） |

## 决策流程（关键决策点停问）

每步做完，到**标注 🔴** 的点停下，向用户说明情况、给推荐、等确认。

1. **理解需求** — 用户要装什么？插件名 / 仓库 URL / "帮我找个能做 X 的"？
2. **定位来源** — 🔴 问用户：是已知插件（给名字/URL）还是要**搜索发现**（GitHub topic `dsh-plugin` 或问 agent 推荐）？
3. **选安装路径** — 先查 npm：`npm view <name> version`。
   - 在 npm → **npm 直装**（最简单）
   - 不在 npm 或 npm 包坏 → **GitHub clone + 注册**（见安装流程）
   - 🔴 若两条路都有风险（peer 冲突、坏发布），停下说明，让用户选"硬装 / 换来源 / 放弃"
4. **安装 + 注册**（见下面流程）
5. **验证**（见验证清单）
6. **报告** — 简明告诉用户装了什么、怎么用、要重启 dsh 吗

## 安装流程

### A. npm 直装（标准，最快）

```bash
dsh plugin --profile <profile> add <pkg>          # = pnpm add 到 profile
```

- **坑：stale dist-tag**。若 `npm view <pkg> version` 返回 `0.0.1-rc.1` 但生态是 `0.1.0-rc.6`，必须钉版本：`dsh plugin --profile <profile> add <pkg>@0.1.0-rc.6`。
- **坑：聚合包要拆**。聚合包（如 `@linxin666/dsh-web-ui-all`）若含坏子包，改为逐个注册可用子包到 `dsh.profile.bundles`（跳过坏的）。
- **坑：add 会丢 bundles 条目**。`dsh plugin add` 重写 profile `package.json` 时可能把其他插件从 `dsh.profile.bundles` 静默移除（dependencies 不动、只动 bundles；症状：dump-config 里原插件消失、stderr 报 `patch: entry "X" not found`）——装完必核对 bundles 清单（见 [edge-cases #17](<技能目录>/references/edge-cases.md)）。
- **坑：pnpm 会复发 junction 损坏**。每次 `dsh plugin add`（= pnpm install）都可能把 link: 跨盘依赖（C: profile → D: 源码）的 junction 打坏——装完必对每个 link: 依赖做 junction 体检并重建（见 [edge-cases #16](<技能目录>/references/edge-cases.md)）。
- 装完若插件要出现在 GUI，确认它在 profile `package.json` 的 `dsh.profile.bundles` 里。

### B. GitHub clone + 注册（对不在 npm 的插件）

**前置：搭共享依赖目录**（若 `<plugins_dir>` 还不存在）——**一条命令**：

```bash
bash <技能目录>/scripts/bootstrap.sh
# 插件目录默认 ~/.dsh/plugins（DSH_PLUGINS_DIR 可改）；profile 默认 web（DSH_PROFILE 可改）
# 或手动（模板在 <技能目录>/templates/_plugins.package.json，含全部验证过的依赖）
```

`bootstrap.sh` 会：建 `<plugins_dir>/` → 写入验证过的 `package.json` 模板 → `npm install` 产出共享 `node_modules` → 提示下一步。模板含：各插件的 `@deepseek-ai/*`（钉 `0.1.0-rc.6`，`cordis@4.0.1`、`schemastery@3.18.1` 例外）+ 裸包 `cordis`/`schemastery` + `react-dom@18.3.1`（防 react 19 冲突）+ 常见插件自身依赖。

然后对每个插件：

1. **下载**：`git clone --depth 1 <repo-url> <plugins_dir>/<name>`（目录名避免撞已有插件名）
2. **检查结构**：`node -e "console.log(require('./<name>/package.json'))"` — 看 `name`、`dsh.bundle`、`dsh.client`、`dependencies`
   - 有 `dsh.bundle.patch` + `cordis.patch.yml` + `lib/` → 可直接注册
   - 缺 `lib/`（未构建）→ 需要先构建（`npm install && npm run build`）或放弃
   - `dsh: {}` 无 bundle → 不是标准 bundle 插件，查 README 怎么装
3. **补共享依赖**：把插件 import 的、`<plugins_dir>/package.json` 没有的包加进去 → `npm install`。用 `grep -rhoE "from '@deepseek-ai/..." <name>/lib` 收集。
4. **注册进 profile**：编辑 `~/.dsh/profiles/<profile>/package.json`
   - `dependencies` 加 `"<name>": "link:<plugins_dir>/<name>"`
   - `dsh.profile.bundles` 加 `"<name>"`（注意顺序：有依赖关系的放前面）
   - `cd ~/.dsh/profiles/<profile> && pnpm install`
5. **验证**（见下）

### C. 装 MCP 服务器 / 技能 / 非插件资源

- **MCP**：在 profile 的 `cordis.patch.yml` 用 `- insert:` 加 `@deepseek-ai/dsh-mcp-client` 实例（见 `<技能目录>/references/install-flow.md`）
- **技能**：两条路都行——
  - 复制到 `~/.dsh/skills/<skill>/`（含 SKILL.md + frontmatter），`dsh-skill-filesystem` 自动发现
  - 或装成**打包技能的插件**（本技能即如此）：`dsh plugin --profile <profile> add dsh-plugin-installer`，经 `ctx.skills` provider 注册，装完即用
- **皮肤**：`@linxin666/dsh-skins` 生态有上游 bug，一键 `bash <技能目录>/scripts/patch-skins.sh`（检测先于打补丁，幂等），配方见 `<技能目录>/references/edge-cases.md`

## 验证清单

```bash
# 1. 组合树里有插件、无 patch 报错
dsh --profile <profile> --dump-config 2>&1 | grep -A2 "插件名"        # 出现即注册成功
# 2. 启动干净（无 "plugin tree failed to load"）
dsh web          # 看到 "dsh web: http://127.0.0.1:3080" 即成功
# 3. 浏览器控制台无 404/500；或检查：
curl -s http://127.0.0.1:3080/_api/plugins | grep '"id":"<插件名>"'   # client 注册了
# 4. 该插件的 client bundle 伺服 200
```

**npm add 之后的必查两项**（`dsh plugin add` 的两个副作用，见 edge-cases #16/#17）：

1. **bundles 完整性**：核对 profile `package.json` 的 `dsh.profile.bundles` 仍包含**所有**既有插件（add 会静默丢条目）；缺谁补谁。
2. **link: junction 体检**：对每个 `link:` 依赖检查 `<profile>/node_modules/<pkg>/package.json` 可解析；坏 junction 先 `cmd /c rmdir` 再 `cmd /c mklink /J ... <绝对目标>` 重建。

## 边缘情况速查（完整版见 `<技能目录>/references/edge-cases.md`）

| 症状 | 原因 | 处理 |
|---|---|---|
| `latest` dist-tag 装错版本 | npm `latest` 指旧 rc | 钉 `0.1.0-rc.6` |
| `nodeLinker` 配置不生效 | pnpm 9.15 bug | `pnpm install --config.nodeLinker=hoisted` 或子插件加为直接依赖 |
| patch "entry not found" | patch 层裸条目 | 包 `- insert:` |
| `ERR_MODULE_NOT_FOUND` | 插件缺依赖 | 补进 `<plugins_dir>/package.json` |
| npm 包缺 chunk（`state-*.js`） | 坏发布 | 跳过或用源码版 |
| 包名撞车 | 两个同 `@scope/name` | 放弃其一 |
| `react-dom` 冲突 | 钉 react@18 但 npm 挑 19 | 显式钉 `react-dom@18.3.1` |
| curl 到 GitHub 报 exit 35 | 代理 SSL | 用 git clone / jsDelivr |
| `/_dsh/*` 路由 404 返回 HTML | 插件要 `httpServer` 服务 | 装 `dsh-http-server-bridge` 桥接插件 |
| 皮肤 apply 400 / bundle 500 | skin-center 上游路径 bug | `<技能目录>/scripts/patch-skins.sh`（walk-up 补丁，版本条件化，幂等重跑） |
| memory-evolve 404 | 功能默认关闭（正常） | 不用管，用户开启功能即出现 |
| 控制台 "Unexpected token '<'" | fetch 到 HTML 当 JSON | 路由没挂 → 用桥接/查该插件 README |
| add 后原插件从 dump-config 消失 | `dsh plugin add` 重写 bundles 丢了其他条目（#17） | 把丢的 bundle 名加回 `dsh.profile.bundles` |
| add 后 link: 插件解析失败 | pnpm 跨盘 junction 复发（#16） | 删坏 junction 后 `mklink /J` 重建为绝对目标，装完必查 |

## 报告模板

装完向用户报告：装了哪个插件 / 来源（npm or GitHub）/ 怎么用（侧边栏入口 / 命令）/ 需要重启 dsh 吗 / 已知限制（如果有）。

---

深度参考（按需读取）：
- `<技能目录>/references/install-flow.md` — 安装流程完整细节（含 MCP/技能/皮肤）
- `<技能目录>/references/edge-cases.md` — 全部坑的完整修复配方
- `<技能目录>/references/diagnostics.md` — 报错分诊表 + 排查命令
- `<技能目录>/references/github-access.md` — GitHub 访问策略与镜像
