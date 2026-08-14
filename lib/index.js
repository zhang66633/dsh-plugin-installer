/**
 * dsh-plugin-installer — bundled skill-provider plugin + plugin store.
 *
 * Node half does both jobs:
 *   1. Registers the packaged `skills/` directory as a `bundled` provider on
 *      `ctx.skills` (the installer/troubleshooter skill, the store's install
 *      backend engine).
 *   2. When the web surface services exist (`webServer`/`systemPrompt`/
 *      `agents` — optional, so the skill still loads in headless/TUI
 *      profiles), serves `/plugin-store/catalog.json`, mounts the
 *      `/plugin-store/install` route (agent-triggered install), and announces
 *      the store to the model via a prompt section.
 *
 * The package is a dsh profile bundle (`dsh.bundle.patch`) with a `dsh.client`
 * manifest, so one profile row mounts both halves: the host loader runs this
 * node half, and the web roster serves the browser half (`./client`).
 *
 * @module dsh-plugin-installer
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider, PROVIDER_NAME } from './skills.js'

/** Cordis plugin name; also the patch row id and the provider name. */
export const name = 'dsh-plugin-installer'

/**
 * Required services: the skill registry plus the web surface. The bundle is
 * web-oriented — non-GUI profiles should install the skill alone via the
 * filesystem route (see README) instead of mounting this bundle row.
 */
export const inject = ['skills', 'webServer', 'systemPrompt', 'agents']

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url))

const STORE_GUIDANCE = '本机已安装 dsh-plugin-installer 插件（含「插件商店」）：会话视图环里有「插件商店」页签，可浏览 dsh 插件目录（名称/介绍/原链接）。用户点击某个插件的「安装」后会请你帮忙安装该插件——请按本包内置的 dsh-plugin-installer 技能流程执行（先确认来源，再选安装路径，装完验证）。'

/** Install-request message the agent receives for a store button click. */
function installRequestText(plugin) {
  return `用户点击了插件商店里的「安装」按钮，请求安装插件：${plugin}（GitHub 仓库 https://github.com/${plugin}）。
请按 dsh-plugin-installer 技能的流程完成安装：
1. 确认来源与插件结构（package.json / dsh.bundle / 是否有 lib 或需要构建）；
2. 选择安装路径（npm 已发布则钉精确版本直装；否则 clone 源码 + 共享依赖层 + link 注册）；
3. 注册进 web profile（dependencies 的 link: 与 dsh.profile.bundles 双登记）；
4. 验证（dsh --profile web --dump-config 里出现该插件）。
完成后告诉用户重启 dsh web 生效；任何破坏性操作先征得用户同意。`
}

/** Read a JSON body with a byte cap. */
function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 4096) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(body === '' ? null : JSON.parse(body))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

/**
 * Mount the bundled skill provider, the store routes, and the prompt section.
 * @param ctx - context carrying skills, webServer, systemPrompt, and agents.
 */
export function apply(ctx) {
  // 1) the installer skill (required service — always registered)
  const provider = createSkillProvider()
  ctx.skills.registerProvider(() => provider)
  ctx.logger.info(`dsh-plugin-installer: registered bundled provider "${PROVIDER_NAME}"`)

  // 2) store surface (injected services — web profile only)
  const webServer = ctx.webServer
  const systemPrompt = ctx.systemPrompt
  const agents = ctx.agents

  ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/plugin-store/catalog.json',
      handler: (_req, res) => {
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-cache',
        })
        res.end(readFileSync(join(DATA_DIR, 'store.json'), 'utf8'))
      },
    }), 'dsh-plugin-installer: catalog route')

    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/plugin-store/install',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { ok: false, error: 'POST only' })
          return
        }
        const payload = await readJsonBody(req)
        const sessionId = payload && typeof payload.sessionId === 'string' ? payload.sessionId : ''
        const plugin = payload && typeof payload.plugin === 'string' ? payload.plugin.trim() : ''
        // Repository name whitelist: owner/repo only (blocks path/URL injection
        // into the prompt and keeps the message shape stable).
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(plugin)) {
          json(res, 400, { ok: false, error: 'bad plugin name (expect owner/repo)' })
          return
        }
        let agent
        try {
          agent = agents.get(sessionId)
        } catch {
          agent = undefined
        }
        if (agent === undefined) {
          json(res, 404, { ok: false, error: 'no live agent for this session' })
          return
        }
        // The click is user intent: a user-sourced follow-up wakes the driver.
        agent.followup({
          content: [{ type: 'text', text: installRequestText(plugin) }],
          source: { kind: 'user' },
        })
        json(res, 200, { ok: true, queued: true, plugin })
      },
    }), 'dsh-plugin-installer: install route')

  ctx.effect(() => systemPrompt.section({
    name: 'plugin:dsh-plugin-installer',
    order: 212,
    text: STORE_GUIDANCE,
  }), 'dsh-plugin-installer: prompt section')
}
