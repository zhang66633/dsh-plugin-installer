# 边缘情况完整修复配方

全部在实践中踩过并验证（2026-08）。每个坑：症状 → 根因 → 修复。

## 1. npm `latest` dist-tag 是旧的

- **症状**：`npm view <pkg> version` 返回 `0.0.1-rc.1`，装出来 API 错配；或插件装不上。
- **根因**：DeepSeek 生态多个包的 `latest` tag 指旧 rc（`0.0.1-rc.1`），实际生态是 `0.1.0-rc.6`。
- **修复**：永远钉精确版本。`npm view <pkg> versions --json | tail` 查真实版本，装 `@精确版本`。
- **例子**：`@deepseek-ai/dsh-workflow` latest 是 `0.0.1-rc.1`（peer 锁旧 dsh-agent → 冲突），但 `0.1.0-rc.6` 存在且 peer 正确。钉 rc.6 即通。

## 2. pnpm 9.15 nodeLinker bug

- **症状**：`pnpm-workspace.yaml` / `.npmrc` 写 `nodeLinker: hoisted`，`pnpm config get nodeLinker` 也返回 `hoisted`，但 `node_modules/.modules.yaml` 仍写 `isolated`；子依赖不 hoist 到顶层 → 顶层解析不到。
- **根因**：pnpm 9.15.0 的 `nodeLinker` 配置在 install 时不生效（只有 CLI 显式传参生效）。
- **修复**：
  - 需要 hoisted 时：`pnpm install --config.nodeLinker=hoisted`（会重建布局）。
  - 通常更稳：**保持 isolated，把子插件加为 profile 直接依赖**（`pnpm add -w @scope/subpkg`），顶层就有 symlink。
- **真实案例（2026-08，cc-tui）**：`dsh plugin --profile cc-tui add dsh-cc-tui` 装的 profile，workspace 写 `nodeLinker: hoisted` 但被 pnpm 9.15 吞掉 → `.modules.yaml` 仍是 `isolated` → cc-tui 的 bundle patch 插的 loader 行（`dsh-session-persistence-sqlite`/`dsh-agent-presets`/`dsh-cordis-host-runner`/`dsh-working-activity`）从 profile 根 import 全 404 → boot 报 `plugin tree failed: Cannot find package '@deepseek-ai/...'`。**修复**：`cd ~/.dsh/profiles/cc-tui && pnpm install --config.nodeLinker=hoisted`（2s 重建），`.modules.yaml` 变 hoisted，5 包回根，dump-config 通过。验证：boot 只剩该插件的 TTY 检查（预期）。

## 3. cordis.patch.yml 是 patch 层，不是 root 配置

- **症状**：在 `cordis.patch.yml` 顶层写 `- id/name/config` 想新增插件实例，dump 里没有它；stderr 报 `patch: entry "X" not found`。
- **根因**：patch 层顶层条目是"id-targeted override / disable / insert"。裸 `- id` 被当作"覆盖已存在的 entry"。
- **修复**：**新增实例必须包在 `- insert:` 列表里**：
  ```yaml
  - insert:
      - id: my-plugin
        name: my-plugin
        config: {...}
  ```
- **验证**：`dsh --profile web --dump-config` 的 stderr 无 patch 报错，树里有该 entry。

## 4. 坏 npm 发布（缺构建 chunk）

- **症状**：插件 boot 报 `ERR_MODULE_NOT_FOUND ... state-IyVnKymD.js`（内容哈希命名文件）。
- **例子**：`@linxin666/dsh-pet@0.1.1` 的 `lib/index.js` import `./state-*.js`，但 publish 没带。
- **修复**：跳过该子包；聚合包改用逐个注册可用子包。

## 5. 包名撞车

- **症状**：两个不同来源的插件同 `@scope/name`（如白某的 `@deepseek-ai/dsh-toolkit` 撞官方）。
- **修复**：放弃其一（不能共存）。向用户说明。

## 6. peer 依赖冲突

- **症状**：`npm install` ERESOLVE。
- **常见**：
  - `react-dom@19` 要 `react@19`，但我们钉 `react@18` → **显式钉 `react-dom@18.3.1`**。
  - 旧包 peer 锁旧 `dsh-agent@^0.0.1-rc.1` → 换该包的正确版本（见坑 1），或放弃。
- **修复**：先修版本对齐；别用 `--legacy-peer-deps` 硬过（会删掉 npm 自动装的 peers，破坏其他解析）。

## 7. GitHub 访问：curl 有 SSL 问题

- **症状**：`curl https://github.com/...` 报 exit 35（SSL connect error）；镜像 504。
- **根因**：代理把 GitHub TLS 弄坏；但 `git clone` 直连可用。
- **修复**：一切 GitHub 下载用 `git clone`。单个文件可用 jsDelivr `https://cdn.jsdelivr.net/gh/<owner>/<repo>@<ref>/<path>`。

## 8. mstar-harness 向插件缺 `httpServer` 服务

- **症状**：插件的 `/_dsh/*` 路由全 404，浏览器返回 SPA HTML，客户端 fetch `.json()` 报 `Unexpected token '<'`。
- **根因**：插件（如 `@dsh-external/dsh-vision-toolkit`）用 `ctx.inject(['httpServer'])` 挂路由，但当前 dsh 只提供 `webServer`，没有 `httpServer`。
- **修复**：装 `dsh-http-server-bridge` 桥接插件（提供 `httpServer`，`register` 委托 `webServer`）。放 bundles 里、在被修的插件**之前**。
- **验证**：`curl -s -o /dev/null -w "%{http_code} %{content_type}" http://127.0.0.1:3080/_dsh/<ns>/settings` → `200 application/json`。

## 9. genui fence-registry 扩展点不存在

- **症状**：genui 控制台 `[genui] fence-registry 扩展点不存在（原版 DSH）——启用 DOM 渲染通道`。
- **根因**：`registerFenceRenderer` 是 `@deepseek-ai/dsh-client-ui-primitives` 模块导出，且需要 harness 的 fence 渲染管线消费它——rc.6 没有。
- **修复**：**不用修**。这是 `console.info` 不是错误；genui 走 DOM 观察通道正常渲染。属"锦上添花"缺失。

## 10. skin-center 皮肤系统上游 bug

- **症状**：`/api/skin-center/bundle/<id>` → 500 或 404；`/api/skin-center/apply` → 400。
- **根因**：skin-center 按源码仓库布局硬编码 `SKINS_DIR = <pkg>/../../../skins/`（npm 装后该位置没有皮肤；且 `import.meta.url` 解析到 `.pnpm` 真实路径，相对路径指向 `.pnpm/.../node_modules/skins/`）。依赖 `dsh-skin` CLI（Windows 无、PATH 无）。
- **修复**（3 件套；**一键 `bash scripts/patch-skins.sh`，检测先于打补丁，幂等可重跑**）：
  1. **补丁 SKINS_DIR（稳健，替代 junction）**：改已装 skin-center 的 `lib/index.js`，把 `const SKINS_DIR = fileURLToPath(new URL("../../../skins/", import.meta.url))` 换成**向上查找真实 `@linxin666`**（含皮肤 `skin.json` 的位置，两种 import.meta.url 解析路径都兼容）：
     ```js
     import { join, dirname } from "node:path";
     const SKINS_DIR = (() => {
       let dir = dirname(fileURLToPath(import.meta.url));
       let best = null;
       for (let i = 0; i < 14; i++) {
         dir = dirname(dir);
         const candidate = join(dir, "node_modules", "@linxin666");
         if (statSync(join(candidate, "dsh-client-ui-skin-qq98", "skin.json"), { throwIfNoEntry: false })) {
           if (!candidate.includes(".pnpm")) return candidate; // 优先顶层（.pnpm hoist 位置会漏新装的皮肤）
           best = candidate;
         }
       }
       return best ?? fileURLToPath(new URL("../../../skins/", import.meta.url));
     })();
     ```
     ⚠️ 不要用 `node_modules/skins/` junction——**Windows junction 创建时固化解析目标**，pnpm 重链接（.pnpm 哈希变化）后 junction 失效。皮肤包是真实依赖，walk-up 补丁跨 pnpm install 存活。**优先顶层 `@linxin666`**：pnpm 的 `.pnpm` hoist 位置会滞后（新装的皮肤如 whale-song 不在那里）。
  2. `dsh-skin.cmd` + `dsh-skin.cjs`（Windows 兼容 shim，写 `~/.dsh/cordis.patch.yml` 激活皮肤段）放 npm 全局 bin。
  3. 给已装 skin-center 打 `shell: true` 补丁（`execFile("dsh-skin", args, {..., shell:true})`），让 node 走 shell 解析 `.cmd`。
- **版本条件化（核心策略——上游可能修、升级可能还原）**：补丁只针对有 bug 的版本。`scripts/patch-skins.sh` 每次运行先**三态检测**再决定，绝不盲打：

  | 检测到 | 含义 | 动作 |
  |---|---|---|
  | `WINDOWS PATCH` 标记在 | 已打补丁 | 跳过 |
  | `SKINS_DIR` 已是稳健写法（无标记） | 上游已修 | 不打，并更新下方版本表 |
  | 旧写法 `const SKINS_DIR = fileURLToPath(...)` | 本版本仍有 bug | 才打 |
  | 其他写法 | 未知新代码 | 不自动改（防覆盖），人工看 |

  重装/升级后**重跑脚本即自动收敛**，不用人记。
- **版本映射表**（升级后更新）：

  | 版本 | 状态 |
  |---|---|
  | `@linxin666/dsh-client-ui-skin-center@0.1.1` | 有 bug → 需补丁 |
  | `0.2.x+` | 待检测——跑 `patch-skins.sh --check`，若已修则删掉本表 ≤0.1.1 条目 |
- **验证**：`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/api/skin-center/bundle/qq98` → `200`。

## 11. 功能开关导致的 404（正常）

- **症状**：插件 client 探测 `/api/<feature>/...` 得 404，某 UI 不出现。
- **例子**：memory-evolve 的 `notifications/coi/broadcast/prompts/bookmarks` 默认关闭 → 404；客户端"探测成功才注入 UI"。
- **修复**：**不用修**。用户去设置里开启功能即出现。别把功能 404 当 bug。

## 12. 会话相关 400

- **症状**：接口带 `sessionId=` 返回 400。
- **根因**：sessionId 是旧/导出会话，当前实例没有该活跃会话（`~/.dsh/sessions/` 里查无）。
- **修复**：用当前活跃会话。不是 bug。

## 13. 需要构建的插件（未构建源码）

- **症状**：有 `dsh.bundle` 但 `lib/` 空或缺文件。
- **修复**：`cd <插件> && npm install && npm run build`。可能因 peer 版本冲突 tsc 失败 → 单独跑 bundler 跳过类型检查（如 `npx tsdown`）生成资源。
- **例子**：genui 的 `lib/assets/mermaid.js` 缺失 → `npx tsdown`（跳过失败的 tsc）生成 3.39MB asset。
