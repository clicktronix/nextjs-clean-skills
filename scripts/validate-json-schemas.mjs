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

const errors = []

for (const { file, schema, fixtures = [] } of targets) {
  const validate = ajv.compile(schema)
  const samples = [{ label: file, data: readJson(file) }, ...fixtures]
  for (const sample of samples) {
    if (!validate(sample.data)) {
      for (const error of validate.errors ?? []) {
        const pointer = error.instancePath || '/'
        const detail = error.params ? ` ${JSON.stringify(error.params)}` : ''
        errors.push(`${sample.label}${pointer} ${error.message}${detail}`)
      }
    }
  }
}

fail(errors)
console.log('json schemas ok')
