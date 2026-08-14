/**
 * dsh-plugin-installer — browser half (the plugin store view).
 *
 * Registers one `conversation.view` entry (the 「插件商店」 tab in the session
 * view ring, beside 聊天/轨迹). The view fetches the catalog snapshot from the
 * host route `/plugin-store/catalog.json`, renders a searchable plugin list
 * (name / description / original link / stars), and the 安装 button asks for
 * confirmation before posting to `/plugin-store/install` (agent-triggered
 * install).
 *
 * @module dsh-plugin-installer/client
 */
import { createElement as h, useEffect, useMemo, useState } from 'react'

/** Plugin name; also the patch row id. */
export const name = 'dsh-plugin-installer'

/** Required services: the slot registry (and sessions for the inject face). */
export const inject = ['slots', 'sessions']

// ── styles (inline tokens; no build step) ────────────────────────────────────
const S = {
  root: { padding: '16px 20px', height: '100%', overflowY: 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '12px' },
  head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: '18px', fontWeight: 600, margin: 0 },
  meta: { fontSize: '12px', color: 'var(--dsw-fg-muted, #8b95a5)' },
  search: { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--dsw-border, #2e3440)', background: 'var(--dsw-bg-elevated, #1e222a)', color: 'var(--dsw-fg, #e5e9f0)', fontSize: '14px', boxSizing: 'border-box' },
  grid: { display: 'flex', flexDirection: 'column', gap: '8px' },
  card: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--dsw-border, #2e3440)', background: 'var(--dsw-bg-elevated, #1e222a)' },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontSize: '14px', fontWeight: 600, color: 'var(--dsw-fg, #e5e9f0)', textDecoration: 'none' },
  cardNameHover: { textDecoration: 'underline' },
  cardDesc: { fontSize: '12px', color: 'var(--dsw-fg-muted, #8b95a5)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  stars: { fontSize: '12px', color: 'var(--dsw-fg-muted, #8b95a5)', whiteSpace: 'nowrap' },
  chip: { fontSize: '11px', padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--dsw-border, #2e3440)', color: 'var(--dsw-fg-muted, #8b95a5)', whiteSpace: 'nowrap' },
  btn: { fontSize: '12px', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--dsw-accent, #4d9fff)', background: 'transparent', color: 'var(--dsw-accent, #4d9fff)', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnDone: { borderColor: 'var(--dsw-fg-muted, #8b95a5)', color: 'var(--dsw-fg-muted, #8b95a5)', cursor: 'default' },
  confirmWrap: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', maxWidth: '260px' },
  confirmText: { fontSize: '11px', color: 'var(--dsw-warning, #e0a43a)', lineHeight: 1.4, textAlign: 'right' },
  btnCancel: { fontSize: '12px', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--dsw-border, #2e3440)', background: 'transparent', color: 'var(--dsw-fg-muted, #8b95a5)', cursor: 'pointer', whiteSpace: 'nowrap' },
  empty: { fontSize: '13px', color: 'var(--dsw-fg-muted, #8b95a5)' },
}

function descOf(plugin) {
  return plugin.description_zh || plugin.description || ''
}

/**
 * The store view: search box + plugin cards. Pure presentation — the catalog
 * arrives over fetch (one subscription), everything else is local state.
 * Injected members arrive as direct props (the slot system spreads the
 * inject face verbatim), so `requestInstall` is a prop, not a nested field.
 */
function StoreView({ requestInstall }) {
  const [catalog, setCatalog] = useState(null)
  const [query, setQuery] = useState('')
  const [requested, setRequested] = useState({})
  const [confirming, setConfirming] = useState({})

  useEffect(() => {
    let alive = true
    fetch('/plugin-store/catalog.json')
      .then((r) => (r.ok ? r.json() : { plugins: [] }))
      .then((doc) => { if (alive) setCatalog(doc.plugins ?? []) })
      .catch(() => { if (alive) setCatalog([]) })
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter((p) => `${p.name} ${descOf(p)} ${p.category}`.toLowerCase().includes(q))
  }, [catalog, query])

  return h('div', { style: S.root },
    h('div', { style: S.head },
      h('h2', { style: S.title }, '插件商店'),
      h('span', { style: S.meta }, catalog ? `${catalog.length} 个插件` : '加载中…'),
    ),
    h('input', {
      style: S.search,
      value: query,
      placeholder: '搜索插件…',
      onChange: (e) => setQuery(e.target.value),
    }),
    h('div', { style: S.grid },
      filtered.length === 0
        ? h('p', { style: S.empty }, catalog ? '没有匹配的插件' : '目录加载中…')
        : filtered.map((p) => {
          const done = requested[p.name]
          const confirmingNow = confirming[p.name]
          return h('div', { key: p.name, style: S.card },
            h('div', { style: S.cardBody },
              h('a', { style: S.cardName, href: p.url, target: '_blank', rel: 'noreferrer', title: p.url }, p.name),
              descOf(p) ? h('p', { style: S.cardDesc, title: descOf(p) }, descOf(p)) : null,
            ),
            p.category ? h('span', { style: S.chip }, p.category) : null,
            p.stars > 0 ? h('span', { style: S.stars }, `★ ${p.stars}`) : null,
            p.installed
              ? h('span', { style: { ...S.btn, ...S.btnDone }, title: '已安装，重启 dsh web 后生效' }, '已安装')
              : done
                ? h('span', { style: { ...S.btn, ...S.btnDone } }, '已请求安装')
                : confirmingNow
                ? h('span', { style: S.confirmWrap },
                    h('span', { style: S.confirmText }, '将修改 web profile 并执行安装命令，确认安装？'),
                    h('span', { style: { display: 'flex', gap: '8px' } },
                      h('button', {
                        style: S.btn,
                        onClick: () => {
                          setConfirming((m) => ({ ...m, [p.name]: false }))
                          setRequested((m) => ({ ...m, [p.name]: true }))
                          if (requestInstall) requestInstall(p.name)
                        },
                      }, '确认安装'),
                      h('button', {
                        style: S.btnCancel,
                        onClick: () => setConfirming((m) => ({ ...m, [p.name]: false })),
                      }, '取消'),
                    ),
                  )
                : h('button', {
                    style: S.btn,
                    onClick: () => setConfirming((m) => ({ ...m, [p.name]: true })),
                  }, '安装'),
          )
        }),
    ),
  )
}

/**
 * Client plugin body: register the store view tab. The registration rides the
 * slot service's effect wrapper, so plugin unload removes the tab.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'store',
    order: 20,
    label: () => '插件商店',
    inject: (sessionId) => ({
      requestInstall: async (pluginName) => {
        try {
          const res = await fetch('/plugin-store/install', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, plugin: pluginName }),
          })
          return await res.json()
        } catch (error) {
          return { ok: false, error: String(error) }
        }
      },
    }),
  }, StoreView))
}
