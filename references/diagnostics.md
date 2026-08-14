# 报错分诊表

面向"插件报错 / dsh 启动失败 / 浏览器控制台报错"的排查路径。先定位错误类型，再对症下药。

## 排查工具（先掌握）

| 工具 | 用途 |
|---|---|
| `dsh --profile web --dump-config 2>&1` | 看组合树 + **stderr 的 patch 报错**（关键：patch 层问题只在 stderr 可见） |
| `dsh web` | 看 boot 日志（"plugin tree failed to load" / MCP 启动信息） |
| `curl -s http://127.0.0.1:3080/_api/plugins` | 看 client 注册清单 |
| `curl -s -o /dev/null -w "%{http_code} %{content_type}" http://127.0.0.1:3080/<url>` | 判断路由是否挂（`200 text/html` = SPA 兜底/没挂；`application/json` = 挂了） |
| `node -e "require('./node_modules/<pkg>/package.json').version"` | 查实际装到的版本 |
| `npm view <pkg> versions --json` | 查真实可用版本（别信 `latest` tag） |

## 启动失败类

### `plugin tree failed to load ... ERR_MODULE_NOT_FOUND`

**根因**：某插件 import 的包在它真实路径上解析不到。
**排查**：
```bash
dsh web 2>&1 | grep "Cannot find package"
# 定位到 <插件>/lib/index.js 缺 <包>
# 该包应存在于 _plugins/node_modules/（共享依赖层）
# 缺 → 加进 _plugins/package.json → npm install
```
**注意**：`lib` 里 grep 到的 `@playwright`/`k6`/`pg` 等可能是 `prompts-seed.json` 提示词文本（误报）；`framer-motion`/`d3.js` 只在 client.js（不由 node 解析）。

### `declares no dsh.bundle in its package.json`

**根因**：包在 `dsh.profile.bundles` 里，但自身 package.json 没 `dsh.bundle.patch`。
**修复**：补 `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}` + 建 cordis.patch.yml（`- insert: {id, name}`，name 必须精确=包名）。

### `duplicate loader entry id: X`

**根因**：两个包的 patch 插入了同一个 entry id（如 `dsh-skins` 和 `dsh-client-ui-skin-center` 都插 `ui-skin-center`）。
**修复**：只注册其一（高层聚合包优先，去掉底层重复）。

### `EADDRINUSE: 127.0.0.1:3080`

**根因**：已有 dsh web 实例在跑（可能之前留的）。
**修复**：`taskkill //PID <pid> //F`（先 `netstat -ano | grep :3080` 查 PID）。

## 运行时 / 浏览器控制台类

### `Unexpected token '<', "<!doctype"... is not valid JSON`

**含义**：客户端 `fetch(url).json()` 拿到 SPA HTML。
**根因**：请求的 API 路由没挂（404 → SPA 兜底）。两种常见：
1. 插件要的 `httpServer` 服务缺失（vision-toolkit 的 `/_dsh/*`）→ 装 `dsh-http-server-bridge`。
2. 插件功能默认关闭 → 探测 404 正常。
**定位**：用 curl 测该 URL，`200 text/html` = 没挂。

### `/api/skin-center/bundle/*` → 500

**根因**：skin-center 的 `SKINS_DIR` 指向不存在的 `node_modules/skins/`。
**修复**：junction 指向皮肤包（见 edge-cases 坑 10）。

### `/api/skin-center/apply` → 400

**根因**：`dsh-skin` CLI 不在 PATH 或路径假设不符。
**修复**：dsh-skin shim + shell:true 补丁（edge-cases 坑 10）。

### 功能接口 404（notifications/coi/bookmarks 等）

**含义**：功能默认关闭，客户端探测 404 后隐藏 UI。**正常**，非 bug。

### 接口带 sessionId → 400

**根因**：sessionId 是旧/导出会话，当前实例无活跃对应。
**处理**：非 bug，用当前活跃会话。

## 判断"要不要修"的三问

1. 这是**功能开关**的 404/隐藏吗？→ 不修，告知用户去设置开启。
2. 这是**上游包 bug**吗（坏发布、路径硬编码、缺 CLI）？→ 有补丁配方就修（见 edge-cases），否则记录为已知限制。
3. 这是**插件与宿主错配**吗（要 httpServer/fence-registry 等）？→ 有桥接就桥接，没有就记录（genui DOM 降级即属此类，可接受）。
