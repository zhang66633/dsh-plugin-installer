/**
 * dsh-plugin-installer — bundled skill provider.
 *
 * Scans this package's `skills/` directory at plugin-apply time, parses the
 * `SKILL.md` bundle's frontmatter, and serves the entry through the
 * `ctx.skills` registry as a `bundled` provider — mirroring the
 * `@deepseek-ai/dsh-skill-badge` precedent. Skill bodies are loaded lazily on
 * `get()`, so file edits are visible to later loads without re-registration.
 *
 * @module dsh-plugin-installer/skills
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { BUNDLED_SKILL_RANK, isSkillName } from '@deepseek-ai/dsh-skill'

/** Provider name registered on `ctx.skills`; also the plugin's package name. */
export const PROVIDER_NAME = 'dsh-plugin-installer'

/** Package root: the base for skill assets (references/ scripts/ templates/). */
const PACKAGE_DIR = fileURLToPath(new URL('../', import.meta.url))
/** Package-local skill root shipped in the npm `files` list. */
const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url))

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/** Parse one SKILL.md into a ParsedSkill; throws on a missing/malformed frontmatter. */
function parseSkillFile(text, filePath) {
  const match = FRONTMATTER_RE.exec(text)
  if (match === null) {
    throw new Error(`${filePath}: missing YAML frontmatter (--- name/description ---)`)
  }
  const raw = parseYaml(match[1] ?? '')
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${filePath}: frontmatter must be a YAML mapping`)
  }
  const name = raw['name']
  if (typeof name !== 'string' || !isSkillName(name)) {
    throw new Error(`${filePath}: frontmatter "name" must be kebab-case, got ${JSON.stringify(name)}`)
  }
  const description = raw['description']
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`${filePath}: frontmatter "description" must be a non-empty string`)
  }
  const whenToUse = raw['whenToUse']
  if (whenToUse !== undefined && typeof whenToUse !== 'string') {
    throw new Error(`${filePath}: frontmatter "whenToUse" must be a string`)
  }
  const disableModel = raw['disable-model-invocation']
  if (disableModel !== undefined && typeof disableModel !== 'boolean') {
    throw new Error(`${filePath}: frontmatter "disable-model-invocation" must be a boolean`)
  }
  const userInvocable = raw['user-invocable']
  if (userInvocable !== undefined && typeof userInvocable !== 'boolean') {
    throw new Error(`${filePath}: frontmatter "user-invocable" must be a boolean`)
  }
  return {
    name,
    description,
    ...(whenToUse !== undefined ? { whenToUse } : {}),
    modelInvocable: disableModel !== true,
    userInvocable: userInvocable !== false,
    filePath,
    body: match[2] ?? '',
  }
}

/** Parse every `SKILL.md` bundle in the packaged skills root, sorted by name. */
function loadSkillEntries() {
  const entries = []
  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillFile = join(SKILLS_DIR, entry.name, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    entries.push(parseSkillFile(readFileSync(skillFile, 'utf8'), skillFile))
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name))
}

function candidateFor(entry) {
  return {
    name: entry.name,
    description: entry.description,
    ...(entry.whenToUse !== undefined ? { whenToUse: entry.whenToUse } : {}),
    invocation: {
      modelInvocable: entry.modelInvocable,
      userInvocable: entry.userInvocable,
    },
    source: 'bundled',
    provider: PROVIDER_NAME,
    resourceBase: { kind: 'directory', path: PACKAGE_DIR },
    rank: BUNDLED_SKILL_RANK,
    locator: { filePath: entry.filePath },
    path: entry.filePath,
  }
}

/** Read and re-parse one skill body for a previously listed candidate. */
async function loadDefinition(candidate) {
  const filePath = candidate.locator.filePath
  const text = await readFile(filePath, 'utf8')
  const entry = parseSkillFile(text, filePath)
  return {
    name: entry.name,
    description: entry.description,
    ...(entry.whenToUse !== undefined ? { whenToUse: entry.whenToUse } : {}),
    invocation: {
      modelInvocable: entry.modelInvocable,
      userInvocable: entry.userInvocable,
    },
    source: 'bundled',
    provider: PROVIDER_NAME,
    resourceBase: { kind: 'directory', path: PACKAGE_DIR },
    content: entry.body,
    path: entry.filePath,
  }
}

/**
 * Build the bundled skill provider over the packaged `skills/` directory.
 * The factory is synchronous (registry contract); bodies load lazily.
 */
export function createSkillProvider(entries = loadSkillEntries()) {
  const candidates = entries.map(candidateFor)
  return {
    name: PROVIDER_NAME,
    list: async () => candidates,
    get: async (candidate) => loadDefinition(candidate),
  }
}

/** Absolute file basename helper re-exported for diagnostics. */
export function skillFileName(filePath) {
  return basename(filePath)
}
