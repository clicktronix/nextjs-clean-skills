#!/usr/bin/env node
import { fail, readJson } from './_lib.mjs'

const errors = []

function requireString(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${path} must be a non-empty string`)
  }
}

function validatePluginManifest(file, { codex }) {
  const json = readJson(file)
  requireString(json.name, `${file}.name`)
  requireString(json.version, `${file}.version`)
  requireString(json.description, `${file}.description`)
  requireString(json.license, `${file}.license`)

  if (json.name !== 'nextjs-clean-skills') errors.push(`${file}.name must be nextjs-clean-skills`)
  if (!/^\d+\.\d+\.\d+$/.test(json.version)) errors.push(`${file}.version must be semver x.y.z`)
  if (codex && (!Array.isArray(json.keywords) || json.keywords.length < 15)) {
    errors.push(`${file}.keywords must contain at least 15 entries`)
  }

  if (codex) {
    if (json.skills !== './skills/') errors.push(`${file}.skills must be ./skills/`)
    requireString(json.interface?.displayName, `${file}.interface.displayName`)
    requireString(json.interface?.shortDescription, `${file}.interface.shortDescription`)
    requireString(json.interface?.longDescription, `${file}.interface.longDescription`)
    if (!Array.isArray(json.interface?.defaultPrompt) || json.interface.defaultPrompt.length === 0) {
      errors.push(`${file}.interface.defaultPrompt must be a non-empty array`)
    }
  }
}

function validateClaudeMarketplace(file) {
  const json = readJson(file)
  if (json.name !== 'nextjs-clean-skills') errors.push(`${file}.name must be nextjs-clean-skills`)
  requireString(json.metadata?.version, `${file}.metadata.version`)
  const plugin = json.plugins?.[0]
  if (!plugin) {
    errors.push(`${file}.plugins[0] is required`)
    return
  }
  if (plugin.name !== 'nextjs-clean-skills') errors.push(`${file}.plugins[0].name must be nextjs-clean-skills`)
  if (plugin.source !== './plugins/nextjs-clean-skills') {
    errors.push(`${file}.plugins[0].source must point at ./plugins/nextjs-clean-skills`)
  }
  requireString(plugin.version, `${file}.plugins[0].version`)
  if (!Array.isArray(plugin.keywords) || plugin.keywords.length < 15) {
    errors.push(`${file}.plugins[0].keywords must contain at least 15 entries`)
  }
}

function validateCodexMarketplace(file) {
  const json = readJson(file)
  if (json.name !== 'nextjs-clean-skills') errors.push(`${file}.name must be nextjs-clean-skills`)
  const plugin = json.plugins?.[0]
  if (!plugin) {
    errors.push(`${file}.plugins[0] is required`)
    return
  }
  if (plugin.name !== 'nextjs-clean-skills') errors.push(`${file}.plugins[0].name must be nextjs-clean-skills`)
  if (plugin.source?.path !== './plugins/nextjs-clean-skills') {
    errors.push(`${file}.plugins[0].source.path must point at ./plugins/nextjs-clean-skills`)
  }
}

validatePluginManifest('plugins/nextjs-clean-skills/.claude-plugin/plugin.json', { codex: false })
validatePluginManifest('plugins/nextjs-clean-skills/.codex-plugin/plugin.json', { codex: true })
validateClaudeMarketplace('.claude-plugin/marketplace.json')
validateCodexMarketplace('.agents/plugins/marketplace.json')

fail(errors)
console.log('json schemas ok')
