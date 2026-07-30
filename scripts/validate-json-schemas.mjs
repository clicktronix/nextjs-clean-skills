#!/usr/bin/env node
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { fail, readJson } from './_lib.mjs'

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }))

const targets = [
  {
    file: 'plugins/nextjs-clean-skills/.claude-plugin/plugin.json',
    schema: readJson('schemas/claude-plugin-manifest.schema.json'),
  },
  {
    file: 'plugins/nextjs-clean-skills/.codex-plugin/plugin.json',
    schema: readJson('schemas/codex-plugin-manifest.schema.json'),
  },
  {
    file: '.claude-plugin/marketplace.json',
    schema: readJson('schemas/claude-marketplace.schema.json'),
  },
  {
    file: '.agents/plugins/marketplace.json',
    schema: readJson('schemas/codex-marketplace.schema.json'),
    fixtures: [
      {
        label: 'codex marketplace default-policy fixture',
        data: {
          name: 'nextjs-clean-skills',
          plugins: [
            {
              name: 'nextjs-clean-skills',
              source: { source: 'local', path: './plugins/nextjs-clean-skills' },
            },
          ],
        },
      },
      {
        label: 'codex marketplace products fixture',
        data: {
          name: 'nextjs-clean-skills',
          plugins: [
            {
              name: 'nextjs-clean-skills',
              source: { source: 'local', path: './plugins/nextjs-clean-skills' },
              policy: { products: ['codex'] },
            },
          ],
        },
      },
    ],
  },
]

// The frontmatter schema has no single JSON file to validate: it describes YAML frontmatter. It is
// covered by fixtures alone, in both directions. The accept fixtures exist because the schema once
// rejected documented values — a string-only looseBoolean refused the unquoted `1` that YAML parses
// as a number, and a name enum refused every rename. The reject fixtures exist because a schema that
// accepts everything is not a gate.
const SKILL_BASE = {
  name: 'creating-react-components',
  description:
    'Use when creating or refactoring Next.js 16 App Router UI: Server/Client boundaries, Hooks, state, forms and actions, loading and errors. Chooses the Server/Client split and state owner.',
}
const skillFrontmatter = readJson('schemas/skill-frontmatter.schema.json')

targets.push({
  schema: skillFrontmatter,
  fixtures: [
    { label: 'frontmatter minimal', data: SKILL_BASE },
    { label: 'frontmatter looseBoolean integer', data: { ...SKILL_BASE, 'disable-model-invocation': 1 } },
    { label: 'frontmatter looseBoolean word', data: { ...SKILL_BASE, 'user-invocable': 'no' } },
    { label: 'frontmatter looseBoolean native', data: { ...SKILL_BASE, background: false } },
    {
      label: 'frontmatter documented Claude Code fields',
      data: {
        ...SKILL_BASE,
        when_to_use: 'Triggers on "review my component".',
        paths: ['**/*.tsx'],
        effort: 'high',
        'allowed-tools': 'Read Grep',
        'disallowed-tools': ['AskUserQuestion'],
        'argument-hint': '[file]',
        arguments: ['file'],
        context: 'fork',
        agent: 'Explore',
        model: 'inherit',
        shell: 'bash',
        hooks: {},
      },
    },
    {
      label: 'frontmatter Agent Skills spec fields',
      data: { ...SKILL_BASE, license: 'MIT', compatibility: 'Designed for Claude Code', metadata: { author: 'x' } },
    },
  ],
  rejectFixtures: [
    { label: 'unknown field', data: { ...SKILL_BASE, descriptoin: 'typo' } },
    { label: 'uppercase name', data: { ...SKILL_BASE, name: 'Creating-React-Components' } },
    { label: 'consecutive hyphens in name', data: { ...SKILL_BASE, name: 'creating--react-components' } },
    { label: 'trailing hyphen in name', data: { ...SKILL_BASE, name: 'creating-react-components-' } },
    { label: 'description over spec cap', data: { ...SKILL_BASE, description: 'x'.repeat(1025) } },
    { label: 'compatibility over spec cap', data: { ...SKILL_BASE, compatibility: 'x'.repeat(501) } },
    { label: 'effort outside the enum', data: { ...SKILL_BASE, effort: 'maximum' } },
    { label: 'context outside the enum', data: { ...SKILL_BASE, context: 'inline' } },
    { label: 'looseBoolean integer out of range', data: { ...SKILL_BASE, background: 2 } },
  ],
})

const errors = []

for (const { file, schema, fixtures = [], rejectFixtures = [] } of targets) {
  const validate = ajv.compile(schema)
  const samples = [...(file ? [{ label: file, data: readJson(file) }] : []), ...fixtures]
  for (const sample of samples) {
    if (!validate(sample.data)) {
      for (const error of validate.errors ?? []) {
        const pointer = error.instancePath || '/'
        const detail = error.params ? ` ${JSON.stringify(error.params)}` : ''
        errors.push(`${sample.label}${pointer} ${error.message}${detail}`)
      }
    }
  }
  for (const sample of rejectFixtures) {
    if (validate(sample.data)) {
      errors.push(`${sample.label}: schema accepted a value it must reject`)
    }
  }
}

fail(errors)
const rejectCount = targets.reduce((sum, target) => sum + (target.rejectFixtures?.length ?? 0), 0)
console.log(`json schemas ok (${rejectCount} rejected mutations)`)
