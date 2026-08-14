/**
 * dsh-plugin-store — browser-half bundle build.
 *
 * Produces lib/client.js in the DSH Web client-module wire format:
 * `window.__ModuleLoader__.load({ id, factory: (require) => { ... } })`.
 *
 * The loader (`@deepseek-ai/dsh-client-modules`) serves this file as a plain
 * script and expects it to REGISTER a factory — executing the bundle must call
 * `window.__ModuleLoader__.load`. A raw ESM source (this repo's earlier
 * `lib/client.js`) never registers, which is what produced
 * `loaded without registering "dsh-plugin-store"`.
 *
 * Platform modules (react and the shared @deepseek-ai client packages) stay
 * external: the loader's injected `require` resolves them from the frozen
 * module table at runtime, so no second copy is inlined into the bundle.
 */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { name: id } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// The shared browser platform module table — mirrors @deepseek-ai/dsh-client-web
// PLATFORM_MODULES. Anything a client bundle requires from this list resolves
// through the loader's injected require; everything else gets inlined.
const PLATFORM_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

await build({
  entryPoints: [fileURLToPath(new URL('../src/client/index.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../lib/client.js', import.meta.url)),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  // Keep CJK product copy literal in the artifact (esbuild's default ascii
  // charset would \u-escape it; browsers render both identically, but the
  // escaped form hides the copy from grep and inflates the file).
  charset: 'utf8',
  external: PLATFORM_EXTERNALS,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  // Wire-format wrapper (same contract as the official tsdown preset in
  // deepseek-harness/packages/client/tsdown.client.ts): banner opens the load
  // handoff, intro creates the factory-scoped module/exports, footer returns
  // and closes.
  // esbuild has no `intro` hook, so the factory-scoped module/exports vars are
  // folded into the banner right after the load() opener.
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
  sourcemap: true,
})

console.log(`built lib/client.js (bundle id "${id}")`)
