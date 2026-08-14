/**
 * dsh-plugin-installer — bundled skill-provider plugin.
 *
 * Registers one `bundled` skill provider on `ctx.skills` whose candidate is
 * the SKILL.md bundle in this package's `skills/` directory. The package is a
 * dsh profile bundle (`dsh.bundle.patch`), so
 * `dsh plugin --profile <name> add dsh-plugin-installer` both mounts this
 * plugin row and exposes the skill to the model-facing catalog.
 *
 * @module dsh-plugin-installer
 */

import { createSkillProvider, PROVIDER_NAME } from './skills.js'

/** Cordis plugin name; also the patch row id and the provider name. */
export const name = 'dsh-plugin-installer'
/** The skill registry service required to register the bundled provider. */
export const inject = ['skills']

/**
 * Register the packaged `skills/` directory as a `bundled` provider on
 * `ctx.skills`. A missing or unparseable skill file fails loudly so packaging
 * defects surface at boot instead of silently shrinking the catalog.
 */
export function apply(ctx) {
  const provider = createSkillProvider()
  ctx.skills.registerProvider(() => provider)
  ctx.logger.info(`dsh-plugin-installer: registered bundled provider "${PROVIDER_NAME}"`)
}
