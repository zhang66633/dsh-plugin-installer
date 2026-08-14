# dsh-plugin-installer

> 在 **DeepSeek Harness（`dsh`）** 里安装与排查插件——小白也能装得明明白白。

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![npm](https://img.shields.io/npm/v/dsh-plugin-installer)
![dsh](https://img.shields.io/badge/dsh-0.1.0--rc.6-green)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Docs](https://img.shields.io/badge/docs-简体中文%20%7C%20English-informational)

[简体中文](./README.zh-CN.md) · [English](./README.md)

---

## 这是什么

`dsh-plugin-installer` 是一个**技能**（agent 指令包），把 DeepSeek Harness 的 agent 变成可靠的插件安装器与报错诊断器。你描述想要的插件，agent 理解需求、定位来源（npm 或 GitHub）、选最稳的安装路径、安装、验证、回报。

这里的每一条流程都**经过实战验证**（2026-08，dsh `0.1.0-rc.6` 生态，真实机器）。

## 为什么需要它

手装 dsh 插件坑很多，官方文档没写：

- npm 的 `latest` dist-tag 还指向旧版 `0.0.1-rc.1`，范围安装直接装错。
- GitHub clone 的插件**不带 node_modules**，要靠**共享依赖层**解析 `@deepseek-ai/*`。
- `cordis.patch.yml` 是 **patch 层**——新增插件实例必须包在 `- insert:` 里，否则被静默跳过。
- 皮肤系统（`@linxin666`）有上游 bug，需要**版本条件化**的补丁。
- pnpm 9.15 会悄悄忽略 `nodeLinker: hoisted`。

这个技能把这些全部沉淀下来，你不需要重新踩一遍。

## 特性

- ✅ **npm 直装**，钉精确版本（防 stale dist-tag）
- ✅ **GitHub clone + 注册**，一条命令搭共享依赖层
- ✅ **MCP 服务器 / 技能 / 皮肤** 的安装路径
- ✅ **`patch-skins.sh`** —— 检测先于打补丁、版本条件化、幂等可重跑的皮肤修复
- ✅ **`diagnose.sh`** —— 一键体检"插件装没装对"
- ✅ **13 个坑的完整配方**（`references/edge-cases.md`，症状 → 根因 → 修复）
- ✅ **小白安全**：每个关键决策点停下来问你
- ✅ **打包成技能提供方插件**（`ctx.skills` provider；可 `dsh plugin add` 安装，进目录就绪）

## 快速开始

### 1. 安装技能

**路线 A —— 作为技能**（文件系统发现，零配置）：

```bash
git clone --depth 1 https://github.com/zhang66633/dsh-plugin-installer ~/.dsh/skills/dsh-plugin-installer
```

`dsh-skill-filesystem` 自动扫描 `~/.dsh/skills`，无需注册、无需重启。

**路线 B —— 作为打包技能的插件**（同时让仓库能进 dsh 插件目录）：

```bash
# 已在 npm 发布为 dsh-plugin-installer@1.1.0：
dsh plugin --profile <profile> add dsh-plugin-installer
# 本地开发直接 link：
#   ~/.dsh/profiles/<profile>/package.json → "dependencies": { "dsh-plugin-installer": "link:<仓库>" }
#   + dsh.profile.bundles 加 "dsh-plugin-installer"
cd ~/.dsh/profiles/<profile> && pnpm install
```

两条路线暴露同一个技能；路线 B 通过 `ctx.skills` bundled provider 注册，也让本仓库具备进入 [awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins) 🎓 技能 类目的资格。

### 2. 让 agent 干活

> 「帮我装个 XX 插件」 / "install the XX plugin for me"

技能接管后按流程走：理解需求 → 定位来源 → 选安装路径 → 安装 → 验证 → 报告。

## 教程 —— 从 GitHub 装一个真实插件

### 第 1 步 · 搭共享依赖层（一次性）

clone 的插件不带 `node_modules`。Node 从模块真实路径**向上**解析依赖，所以一个共同的祖先目录 + 一个 `node_modules` 就是公共解析层。一条命令搞定：

```bash
bash <技能目录>/scripts/bootstrap.sh
# 插件目录默认 ~/.dsh/plugins，可用 DSH_PLUGINS_DIR 覆盖
```

脚本会写入验证过的 `package.json` 模板（全部 `@deepseek-ai/*` 钉 `0.1.0-rc.6`、`cordis`/`schemastery` 双变体、`react-dom@18.3.1` 防 react 19 冲突），并执行 `npm install`。

### 第 2 步 · 下载 + 检查结构

```bash
git clone --depth 1 https://github.com/<owner>/<repo>.git <plugins_dir>/<name>
cd <plugins_dir>/<name>
node -e "const p=require('./package.json'); console.log(JSON.stringify({name:p.name, main:p.main, dsh:p.dsh, deps:p.dependencies},null,1))"
ls lib/ 2>/dev/null
```

判定：
- ✅ **可直接注册** —— 有 `dsh.bundle.patch` + `cordis.patch.yml` + `lib/index.js`
- ⚠️ **未构建** —— 有 `dsh.bundle` 但 `lib/` 空 → `npm install && npm run build`
- ❌ **坏发布** —— `lib/index.js` import 了缺失的 chunk → 放弃或用源码构建

### 第 3 步 · 补共享依赖

```bash
grep -rhoE "from ['\"]([^./][^'\"]*)" lib/ | sed "s/from ['\"]//" | sed 's#/.*##' | sort -u
cd <plugins_dir> && npm install   # 把缺的包加进 package.json 后
```

### 第 4 步 · 注册进 profile

编辑 `~/.dsh/profiles/<profile>/package.json`（profile 默认 `web`）：

```jsonc
{
  "dependencies": {
    "<插件名>": "link:<plugins_dir>/<name>"
  },
  "dsh": {
    "profile": {
      "bundles": ["<插件名>"]
    }
  }
}
```

```bash
cd ~/.dsh/profiles/<profile> && pnpm install
```

### 第 5 步 · 验证

```bash
dsh --profile <profile> --dump-config 2>&1 | grep -A2 <name>   # 出现在组合树里
dsh web                                                       # 启动干净
bash <技能目录>/scripts/diagnose.sh <name>                     # 全项体检
```

## 配置

### 环境变量

| 变量 | 默认 | 用途 |
|---|---|---|
| `DSH_PLUGINS_DIR` | `~/.dsh/plugins` | clone 的插件 + 共享 `node_modules` 所在目录 |
| `DSH_PROFILE` | `web` | 要注册插件的 dsh profile |

### MCP 服务器

在 profile 的 `cordis.patch.yml` 加 MCP 服务器——**必须包在 `- insert:` 里**：

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

HTTP 模式用 `transport: streamable-http` + `url`（token 用 `!!js '`${process.env.XXX}`'` 引用）。

### 皮肤

`@linxin666/dsh-skins` 有上游 bug（皮肤 bundle 404/500、apply 400）。用版本条件化的修复脚本一键搞定：

```bash
bash <技能目录>/scripts/patch-skins.sh          # 检测 → 打补丁（幂等）
bash <技能目录>/scripts/patch-skins.sh --check  # 只报告，不打
```

绝不盲打：上游修了的话，重跑会检测到并跳过。

## 卸载

- **作为技能**：`rm -rf ~/.dsh/skills/dsh-plugin-installer`
- **作为插件**：从 `~/.dsh/profiles/<profile>/package.json` 移除依赖和 `dsh.profile.bundles` 条目，然后

  ```bash
  cd ~/.dsh/profiles/<profile> && pnpm install
  ```

## 工作原理

核心是**共享依赖层**。GitHub clone 的插件通过 `link:` 注册进 profile；运行时 Node 从插件真实路径向上解析 `@deepseek-ai/*`，于是共同的祖先目录里的一个 `<plugins_dir>/node_modules` 就满足所有插件。新插件装进来，只需把缺的依赖加进那一个 `package.json` 再 `npm install`。

补丁管理**版本条件化**：每个补丁在已装文件里留标记；脚本动手前先检测 *已打 / 上游已修 / 需打*，升级或重装后下一次运行即自动收敛。

## 兼容性

- **dsh 生态**：`0.1.0-rc.6`——**最后验证 2026-08-14**（技能本体 + 插件加载 + `dsh --dump-config`）。npm `latest` tag 是旧的——永远钉精确版本
- **系统**：Windows（Git Bash）、macOS、Linux——脚本是 POSIX `bash`
- **pnpm**：处理了 9.15 `nodeLinker` 的坑（需要 hoist 时用 `pnpm install --config.nodeLinker=hoisted`）

## 目录结构

```
dsh-plugin-installer/
├── package.json                # 插件清单（dsh.bundle.patch → cordis.patch.yml）
├── cordis.patch.yml            # patch 层：插入插件实例
├── lib/
│   ├── index.js                # cordis 插件：注册 bundled 技能 provider
│   └── skills.js               # provider：扫描 skills/，解析 SKILL.md frontmatter
├── skills/
│   └── dsh-plugin-installer/
│       └── SKILL.md            # 技能本体
├── references/
│   ├── install-flow.md         # 完整安装流程（npm / GitHub / MCP / 技能 / 皮肤）
│   ├── edge-cases.md           # 13 个坑的完整配方
│   ├── diagnostics.md          # 报错分诊表 + 排查命令
│   └── github-access.md        # GitHub 访问策略（git clone 优先于 curl）
├── scripts/
│   ├── bootstrap.sh            # 搭共享依赖层
│   ├── patch-skins.sh          # 版本条件化皮肤修复
│   └── diagnose.sh             # 插件体检
└── templates/
    └── _plugins.package.json   # 验证过的依赖模板
```

## 权限与数据

本技能在你的机器上安装和管理 dsh 插件。涉及范围：

- **读写的文件**：你的 dsh profile（`~/.dsh/profiles/<profile>/package.json`）、patch 层（`~/.dsh/cordis.patch.yml`）、`<plugins_dir>` 下的插件目录。会编辑 profile 清单来注册插件。
- **网络**：npm registry（安装/更新插件）与 GitHub（源码插件 git clone）。无统计、无遥测。
- **凭据**：不存储任何东西——从不读 `.credentials.yaml` 或任何 API key。
- **执行**：自带脚本（`bootstrap.sh`、`patch-skins.sh`、`diagnose.sh`）会在你的机器上运行 shell 命令（`npm`、`pnpm`、`git`、`node`）。

本地、用户可控：没有你在 🔴 决策点点头，什么都不会替你做。

## 排查

- 跑 `bash <技能目录>/scripts/diagnose.sh <插件>` 做结构化体检。
- 查 `references/edge-cases.md`：13 个真实坑的 症状 → 根因 → 修复（stale dist-tag、pnpm nodeLinker、`- insert:` 要求、坏发布、GitHub SSL、缺 `httpServer`、皮肤 bug 等）。
- 踩到新坑？加进 `edge-cases.md`——这个技能是活的配方本。

## 贡献

发现新坑或更好的修复？欢迎 PR。`references/edge-cases.md` 保持三段式（症状 → 根因 → 修复）；上游更新时记得更新皮肤一节的版本表。

## 许可证与安全

[MIT](./LICENSE) © 2026 zhang66633

要私下报告安全问题，请在本仓库开 GitHub security advisory，而不是公开 issue。
