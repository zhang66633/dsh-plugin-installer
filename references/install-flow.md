# 安装流程完整细节

本文给出每个安装路径的可执行步骤。环境假设：Windows、`dsh web`。以下占位符可配置：
- `<plugins_dir>` — 本地插件目录，默认 `~/.dsh/plugins`，环境变量 `DSH_PLUGINS_DIR` 覆盖
- `<profile>` — profile 名，默认 `web`，环境变量 `DSH_PROFILE` 覆盖

## 0. 前置检查

```bash
# 确认 dsh 与 pnpm
dsh --version
pnpm --version        # 9.15.0 有 nodeLinker bug（见 edge-cases）

# 确认 profile 结构
ls ~/.dsh/profiles/<profile>/       # 应有 package.json + cordis.patch.yml + pnpm-lock.yaml
```

## A. npm 直装

```bash
dsh plugin --profile <profile> add <pkg>@<exact-version>
```

要点：
- **总是查真实版本**：`npm view <pkg> versions --json | tail`。`npm view <pkg> version`（`latest` tag）可能指旧版。
- 生态当前是 `0.1.0-rc.6`（2026-08）。`cordis@4.0.1`、`schemastery@3.18.1` 例外。
- 聚合包（`dsh-web-ui-all` 类）：README 说装聚合包，但若含坏子包（如 `@linxin666/dsh-pet` 缺 chunk），改为逐个注册可用子包到 `dsh.profile.bundles`。
- **GUI 可见性**：装完确认包在 profile `package.json` 的 `dsh.profile.bundles` 里（决定 client 是否进 Web GUI）。仅加 dependencies 不保证 client 注册。

### pnpm 布局两个坑

1. **profile 用 isolated 布局**（`node_modules/.modules.yaml` 写 `nodeLinker: isolated`）。聚合包的子依赖不会被 hoist 到顶层 → 顶层解析不到。**解法**：把子插件加为 profile 直接依赖（`pnpm add -w @scope/子包`），顶层就有 symlink。
2. **`pnpm-workspace.yaml` 的 `nodeLinker: hoisted` 不生效**（pnpm 9.15 bug）。需要 hoisted 时用 `pnpm install --config.nodeLinker=hoisted`（会重建布局，可能影响现有 link）。

## B. GitHub clone + 注册

### B0. 搭建共享依赖目录（一次性）

`<plugins_dir>/` 是所有本地插件的共同祖先目录。**关键机制**：Node 从插件真实路径向上解析依赖，`<plugins_dir>/node_modules` 是公共解析层。

`<plugins_dir>/package.json` 内容要点（`dependencies`）：
- 全部插件 import 的 `@deepseek-ai/*`，**钉 `0.1.0-rc.6`**（`cordis@4.0.1`、`schemastery@3.18.1` 除外）
- 裸包 `cordis@4.0.0-rc.8`、`schemastery@3.18.0`（与 `@deepseek-ai/*` 前缀版是**不同包**，都要装）
- `react@^18.3.1` **和 `react-dom@18.3.1`**（必须显式钉 18.3.1，否则 npm 挑 react-dom@19 与 react@18 冲突）
- 各插件的自身 `dependencies`（`zod`、`saxes`、`quickjs-emscripten`、`echarts`、`shiki`、`@openmaic/*` 等）

```bash
cd <plugins_dir> && npm install        # 或: bash <技能目录>/scripts/bootstrap.sh
```

### B1. 下载

```bash
cd <plugins_dir>
git clone --depth 1 https://github.com/<owner>/<repo>.git <name>
```

- **git clone 直连可用**（curl 有 SSL 问题，别用 curl 抓 GitHub）。
- 目录名避免撞已有插件名（如 `dsh-toolkit` 已存在 → 用 `dsh-toolkit-<author>`）。
- 仓库名带下划线等（如 `dsh_workflow`）作为目录名没问题。

### B2. 检查插件结构

```bash
cd <name>
node -e "const p=require('./package.json'); console.log(JSON.stringify({name:p.name, main:p.main, dsh:p.dsh, deps:p.dependencies},null,1))"
ls lib/ 2>/dev/null
```

判定：
- ✅ **可直接注册**：`dsh.bundle.patch` 存在 + `cordis.patch.yml` 存在 + `lib/index.js` 存在（已构建）
- ⚠️ **未构建**：有 `dsh.bundle` 但 `lib/` 空/缺 → `npm install && npm run build`（可能因 peer 版本冲突失败，见 edge-cases）
- ⚠️ **非 bundle 插件**：`dsh: {}` 无 bundle → 读 README 找装法（可能是 patch-only / 特殊类型）
- ❌ **坏发布**：`lib/index.js` import 了不存在的文件（如 `state-*.js`）→ 放弃或用源码构建

### B3. 补共享依赖

```bash
# 收集该插件 import 的包
grep -rhoE "from ['\"]([^./][^'\"]*)" lib/ 2>/dev/null | sed "s/from ['\"]//" | sed 's#/.*##' | sort -u
# 与 <plugins_dir>/package.json 的 dependencies 对比，缺的加进去
# 注意：lib 里 grep 到的 @playwright/k6/pg 等可能是 prompts-seed.json 提示词文本（误报）
# 注意：framer-motion/d3.js 只在 client.js（前端 bundle，不由 node 解析），不用装
cd <plugins_dir> && npm install
```

### B4. 注册进 profile

编辑 `~/.dsh/profiles/<profile>/package.json`：

```jsonc
"dependencies": {
  // ...
  "<插件name>": "link:<plugins_dir>/<目录>",
},
"dsh": { "profile": { "bundles": [
  // ... 有依赖关系的放前面；client 型插件按需
  "<插件name>",
]}}
```

```bash
cd ~/.dsh/profiles/<profile> && pnpm install
```

### B5. 验证

见 SKILL.md 验证清单。核心：
- `dsh --profile <profile> --dump-config 2>&1 | grep -A2 <name>` → 出现在树里
- `dsh web` 启动无 "plugin tree failed to load"

## C. MCP 服务器

MCP 配在 profile 的 `cordis.patch.yml`，**必须 `- insert:` 包装**：

```yaml
- insert:
    - id: mcp-<server>
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: <名字>
        transport: stdio                # 或 streamable-http
        command: npx
        args: ['-y', '<mcp包>']
        # HTTP 模式用 url + headers；token 用 !!js '`${process.env.XXX}`' 引用
```

验证：boot 日志出现 MCP server 启动信息（如 `Context7 Documentation MCP Server ... running on stdio`）。

## D. 技能

```bash
mkdir -p ~/.dsh/skills
cp -r <技能目录> ~/.dsh/skills/<skill>/    # 含 SKILL.md + frontmatter
```

`dsh-skill-filesystem` 自动扫描 `~/.dsh/skills`，无需注册。技能格式：`SKILL.md` + YAML frontmatter（`name`、`description`）。

## E. 皮肤（@linxin666 生态，上游有 bug）

**一键修复**（检测先于打补丁，幂等可重跑）：

```bash
bash <技能目录>/scripts/patch-skins.sh            # 自动检测+打补丁
bash <技能目录>/scripts/patch-skins.sh --check    # 只检测报告，不打
```

要点：
1. **walk-up 补丁**（替代早期失败的 junction 方案）：把已装 skin-center 的 `lib/index.js` 里 `SKINS_DIR` 换成向上查找真实 `@linxin666` 的逻辑（npm 安装下皮肤在 `node_modules/@linxin666`，不在包相对路径）。见 edge-cases.md 完整配方。
2. **版本条件化**：脚本三态检测（已打 / 上游已修 / 需打），升级或重装后重跑自动收敛；上游修了就不打。
3. `dsh-skin.cmd` + `.cjs` shim 放 npm 全局 bin（修 apply）+ 给已装 skin-center 打 `shell: true` 补丁——这两个一次性，脚本会检测并提示。
