#!/usr/bin/env node
import { fail, readJson, writeJson } from './_lib.mjs'

const check = process.argv.includes('--check')
const source = readJson('version.json')
const pluginName = 'nextjs-clean-skills'
const pluginPath = `./plugins/${pluginName}`
const keywords = [
  'clean-architecture',
  'nextjs',
  'nextjs-16',
  'react-server-components',
  'cache-components',
  'server-actions',
  'next-safe-action',
  'valibot',
  'mantine',
  'supabase',
  'tanstack-query',
  'composeHooks',
  'dal',
  'rls',
  'agent-skills',
]

const targets = [
  {
    file: 'package.json',
    apply(json) {
      json.name = pluginName
      json.version = source.version
      json.keywords = keywords
    },
  },
  {
    file: 'plugins/nextjs-clean-skills/.claude-plugin/plugin.json',
    apply(json) {
      json.name = pluginName
      json.version = source.version
    },
  },
  {
    file: 'plugins/nextjs-clean-skills/.codex-plugin/plugin.json',
    apply(json) {
      json.name = pluginName
      json.version = source.version
      json.keywords = keywords
    },
  },
  {
    file: '.claude-plugin/marketplace.json',
    apply(json) {
      json.name = pluginName
      json.metadata.version = source.version
      json.plugins[0].name = pluginName
      json.plugins[0].version = source.version
      json.plugins[0].source = pluginPath
      json.plugins[0].keywords = keywords
    },
  },
  {
    file: '.agents/plugins/marketplace.json',
    apply(json) {
      json.name = pluginName
      json.interface.displayName = 'Next.js Clean Skills'
      json.plugins[0].name = pluginName
      json.plugins[0].source.path = pluginPath
    },
  },
]

const errors = []

for (const target of targets) {
  const before = JSON.stringify(readJson(target.file), null, 2) + '\n'
  const json = JSON.parse(before)
  target.apply(json)
  const after = JSON.stringify(json, null, 2) + '\n'
  if (before !== after) {
    if (check) {
      errors.push(`${target.file} is not synced with version.json`)
    } else {
      writeJson(target.file, json)
    }
  }
}

fail(errors)
if (!check) console.log(`synced ${pluginName}@${source.version}`)
