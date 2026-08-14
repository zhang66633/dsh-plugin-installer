/**
 * dsh-plugin-installer — provider unit tests.
 *
 * Uses the built-in `node:test` runner (zero dependencies). Run with
 * `npm test` (node --test tests/).
 *
 * @module dsh-plugin-installer/tests/skills
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createSkillProvider, parseSkillFile, PROVIDER_NAME } from '../lib/skills.js'

test('parseSkillFile: parses valid frontmatter and body', () => {
  const text = '---\nname: my-skill\ndescription: does things\n---\n# Body\ncontent here\n'
  const p = parseSkillFile(text, '/x/SKILL.md')
  assert.equal(p.name, 'my-skill')
  assert.equal(p.description, 'does things')
  assert.equal(p.modelInvocable, true)
  assert.equal(p.userInvocable, true)
  assert.match(p.body, /# Body/)
})

test('parseSkillFile: honors disable-model-invocation and user-invocable', () => {
  const text = '---\nname: my-skill\ndescription: x\nuser-invocable: false\ndisable-model-invocation: true\n---\nbody\n'
  const p = parseSkillFile(text, '/x/SKILL.md')
  assert.equal(p.modelInvocable, false)
  assert.equal(p.userInvocable, false)
})

test('parseSkillFile: missing frontmatter throws', () => {
  assert.throws(() => parseSkillFile('no frontmatter here', '/x/SKILL.md'), /missing YAML frontmatter/)
})

test('parseSkillFile: non-kebab name throws', () => {
  const text = '---\nname: Not Kebab Case\ndescription: x\n---\n'
  assert.throws(() => parseSkillFile(text, '/x/SKILL.md'), /kebab-case/)
})

test('parseSkillFile: missing description throws', () => {
  const text = '---\nname: my-skill\n---\n'
  assert.throws(() => parseSkillFile(text, '/x/SKILL.md'), /description/)
})

test('createSkillProvider: lists and loads the bundled skill', async () => {
  const provider = createSkillProvider()
  assert.equal(provider.name, PROVIDER_NAME)

  const list = await provider.list()
  const candidate = list.find((c) => c.name === 'dsh-plugin-installer')
  assert.ok(candidate, 'bundled skill candidate must be present')
  assert.equal(candidate.source, 'bundled')
  assert.equal(candidate.provider, PROVIDER_NAME)
  assert.equal(candidate.invocation.modelInvocable, true)
  assert.equal(candidate.invocation.userInvocable, true)

  const definition = await provider.get(candidate)
  assert.ok(definition.content.length > 1000, 'skill body should be non-trivial')
  assert.match(definition.content, /# DSH 插件安装器/)
})
