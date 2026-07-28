#!/usr/bin/env node
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import fs from 'node:fs'
import path from 'node:path'
import { fail, parseFrontmatter, readJson, readText, root } from './_lib.mjs'

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }))
const validateFrontmatter = ajv.compile(readJson('schemas/skill-frontmatter.schema.json'))

// GitHub heading-anchor slug, same semantics as validate-scenarios.mjs: lowercase, drop all but
// [a-z0-9 -], then spaces to hyphens WITHOUT collapsing runs.
const slugify = (heading) =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-')

const headingSlugs = (absFile) => {
  const slugs = new Set()
  for (const line of fs.readFileSync(absFile, 'utf8').split('\n')) {
    const match = /^#{1,6}\s+(.*)$/.exec(line)
    if (match) slugs.add(slugify(match[1].trim()))
  }
  return slugs
}

const checkLink = (fromLabel, baseDir, linkPath, anchor, errors) => {
  const resolved = path.resolve(baseDir, linkPath)
  if (!fs.existsSync(resolved)) {
    errors.push(`${fromLabel} links missing ${linkPath}`)
    return
  }
  if (anchor && !headingSlugs(resolved).has(anchor)) {
    errors.push(`${fromLabel} links ${linkPath}#${anchor}, but that heading does not exist`)
  }
}

const skillsRoot = path.join(root, 'plugins/nextjs-clean-skills/skills')
const expected = new Set(['nextjs-architecture', 'react-component-creator'])
const errors = []
const warnings = []

for (const skillName of fs.readdirSync(skillsRoot)) {
  const skillDir = path.join(skillsRoot, skillName)
  if (!fs.statSync(skillDir).isDirectory()) continue
  if (!expected.has(skillName)) errors.push(`Unexpected skill directory: ${skillName}`)

  const file = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(file)) {
    errors.push(`${skillName} is missing SKILL.md`)
    continue
  }

  const text = fs.readFileSync(file, 'utf8')
  const frontmatter = parseFrontmatter(text)
  if (!frontmatter) {
    errors.push(`${skillName}/SKILL.md is missing or has invalid YAML frontmatter`)
    continue
  }

  if (!validateFrontmatter(frontmatter)) {
    for (const error of validateFrontmatter.errors ?? []) {
      const pointer = error.instancePath || '/'
      errors.push(`${skillName}/SKILL.md frontmatter${pointer} ${error.message}`)
    }
    continue
  }

  if (frontmatter.name !== skillName) {
    errors.push(`${skillName}/SKILL.md frontmatter.name must equal directory name (${skillName})`)
  }

  if (!frontmatter.description.startsWith('Use when ')) {
    errors.push(`${skillName}/SKILL.md frontmatter.description must start with "Use when "`)
  }

  if (frontmatter.description.length > 500) {
    errors.push(`${skillName}/SKILL.md frontmatter.description is ${frontmatter.description.length} chars; keep it <= 500`)
  }

  // Claude Code truncates skill frontmatter after 1,536 characters. Keep the combined
  // routing metadata below that limit even though Codex has different context budgeting.
  const frontmatterLength = `name: ${frontmatter.name}\ndescription: ${frontmatter.description}`.length
  if (frontmatterLength > 1536) {
    errors.push(`${skillName}/SKILL.md frontmatter is ${frontmatterLength} chars; keep it <= 1536`)
  }

  const linkedReferences = new Set()
  for (const match of text.matchAll(/`(references\/[^`]+\.md)`/g)) {
    linkedReferences.add(match[1])
  }
  for (const match of text.matchAll(/\[[^\]]+\]\((references\/[^)#]+\.md)(?:#[^)]*)?\)/g)) {
    linkedReferences.add(match[1])
  }

  for (const match of text.matchAll(/\[[^\]]+\]\(([^)#]+\.md)(?:#([^)]*))?\)/g)) {
    const linkPath = match[1]
    if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) continue
    checkLink(`${skillName}/SKILL.md`, skillDir, linkPath, match[2], errors)
  }

  // Recurse: references are grouped into subdirectories by the decision they serve, and an
  // unlinked reference is dead weight — it ships in the plugin but no routing path reaches it.
  const referenceDir = path.join(skillDir, 'references')
  if (fs.existsSync(referenceDir)) {
    const walk = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(dir, entry.name)
        if (entry.isDirectory()) return walk(absolute)
        return entry.name.endsWith('.md') ? [absolute] : []
      })
    for (const absolute of walk(referenceDir)) {
      const referencePath = path.relative(skillDir, absolute).split(path.sep).join('/')
      if (!linkedReferences.has(referencePath)) {
        errors.push(`${skillName}/SKILL.md does not link ${referencePath}`)
      }
      // References link each other too. Only SKILL.md links were checked before, so a pointer
      // inside a reference could name a file deleted in the same release and ship silently.
      const referenceText = fs.readFileSync(absolute, 'utf8')
      for (const match of referenceText.matchAll(/\[[^\]]+\]\(([^)#]+\.md)(?:#([^)]*))?\)/g)) {
        if (match[1].startsWith('http')) continue
        checkLink(referencePath, path.dirname(absolute), match[1], match[2], errors)
      }
    }
  }

  // Recommended structure, not enforced: these gates shape agent behavior and should be
  // validated by eval/pressure-tests before becoming a hard requirement. Warn, do not fail.
  for (const requiredHeading of ['## Decision Gate', '## Common Failure Modes', '## Verification Gate']) {
    if (!text.includes(requiredHeading)) {
      warnings.push(`${skillName}/SKILL.md is missing recommended ${requiredHeading}`)
    }
  }
}

for (const skillName of expected) {
  if (!fs.existsSync(path.join(skillsRoot, skillName))) errors.push(`Missing skill directory: ${skillName}`)
}

const readme = readText('README.md')
for (const skillName of expected) {
  if (!readme.includes(skillName)) errors.push(`README.md does not mention ${skillName}`)
}

for (const warning of warnings) console.warn(`warning: ${warning}`)
fail(errors)
console.log(`skill frontmatter ok${warnings.length ? ` (${warnings.length} warnings)` : ''}`)
