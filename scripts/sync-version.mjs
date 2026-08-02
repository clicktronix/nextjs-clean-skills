#!/usr/bin/env node
import { fail, readJson, writeJson } from './_lib.mjs'

const check = process.argv.includes('--check')
const source = readJson('version.json')
const pluginName = 'nextjs-clean-skills'
const pluginPath = `./plugins/${pluginName}`
const description =
  'Next.js 16 skills for capability-first architecture and React Server/Client Component design.'
const claudeMarketplaceDescription =
  'Portable Claude Code skills for capability-first Next.js 16 architecture and React Server/Client Component design.'
const keywords = [
  'clean-architecture',
  'nextjs',
  'nextjs-16',
  'react-server-components',
  'cache-components',
  'server-actions',
  'supabase',
  'tanstack-query',
  'capability-modules',
  'runtime-boundaries',
  'ports-and-adapters',
  'server-client-boundaries',
  'route-handlers',
  'streaming',
  'rls',
  'agent-skills',
]

const targets = [
  {
    file: 'package.json',
    apply(json) {
      json.name = pluginName
      json.version = source.version
      json.description = description
      json.keywords = keywords
    },
  },
  {
    file: 'package-lock.json',
    apply(json) {
      json.name = pluginName
      json.version = source.version
      delete json.description
      if (json.packages?.['']) {
        json.packages[''].name = pluginName
        json.packages[''].version = source.version
      }
    },
  },
  {
    file: 'plugins/nextjs-clean-skills/.claude-plugin/plugin.json',
    apply(json) {
      json.name = pluginName
      json.version = source.version
      json.description = description
    },
  },
  {
    file: 'plugins/nextjs-clean-skills/.codex-plugin/plugin.json',
    apply(json) {
      json.name = pluginName
      json.version = source.version
      json.description = description
      json.keywords = keywords
      json.interface.shortDescription = 'Capability-first Next.js and React skills.'
      json.interface.longDescription =
        'Codex skills for capability-owned Next.js modules, runtime-specific public surfaces, channel-native RSC, Actions, HTTP, streams and jobs, and safe React Server/Client Component boundaries.'
      json.interface.defaultPrompt = [
        'Design this Next.js feature around capability ownership and native runtime boundaries.',
        'Create this React component with the correct Server/Client and state boundaries.',
      ]
    },
  },
  {
    file: '.claude-plugin/marketplace.json',
    apply(json) {
      json.name = pluginName
      json.metadata.version = source.version
      json.metadata.description = claudeMarketplaceDescription
      json.plugins[0].name = pluginName
      json.plugins[0].version = source.version
      json.plugins[0].source = pluginPath
      json.plugins[0].description = description
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
  {
    file: 'rules/architecture-contract.json',
    apply(json) {
      json.contractVersion = source.version
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
