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
const expected = new Set(['designing-architecture', 'creating-react-components'])
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

  // A rename that misses the human-facing titles ships a skill that is called one thing in the
  // listing and another in every UI: PR #16 renamed directories, frontmatter, scenarios and docs
  // but left `# React Component Creator` and `display_name: "Next.js Architecture"` behind, and
  // nothing here noticed. Both titles must slug back to the skill name, which ties them to renames.
  const heading = /^#\s+(.+)$/m.exec(text)
  if (!heading) {
    errors.push(`${skillName}/SKILL.md has no H1 title`)
  } else if (slugify(heading[1].trim()) !== skillName) {
    errors.push(
      `${skillName}/SKILL.md H1 "${heading[1].trim()}" does not match the skill name; expected a title that slugs to ${skillName}`,
    )
  }

  const openaiInterface = path.join(skillDir, 'agents', 'openai.yaml')
  if (fs.existsSync(openaiInterface)) {
    const yaml = fs.readFileSync(openaiInterface, 'utf8')
    const displayName = /^\s*display_name:\s*"?([^"\n]+?)"?\s*$/m.exec(yaml)
    if (!displayName) {
      errors.push(`${skillName}/agents/openai.yaml has no interface.display_name`)
    } else if (slugify(displayName[1]) !== skillName) {
      errors.push(
        `${skillName}/agents/openai.yaml display_name "${displayName[1]}" does not match the skill name; expected a title that slugs to ${skillName}`,
      )
    }
  }

  if (!frontmatter.description.startsWith('Use when ')) {
    errors.push(`${skillName}/SKILL.md frontmatter.description must start with "Use when "`)
  }

  if (frontmatter.description.length > 500) {
    errors.push(`${skillName}/SKILL.md frontmatter.description is ${frontmatter.description.length} chars; keep it <= 500`)
  }

  // Claude Code truncates the combined description and when_to_use text at 1,536 characters in the
  // skill listing. when_to_use counts toward that cap, so it has to be measured here: the schema now
  // permits the field, and a check that ignored it would let the first adopter silently blow the very
  // limit it exists to guard.
  const routingText = [frontmatter.description, frontmatter.when_to_use].filter(Boolean).join(' ')
  if (routingText.length > 1536) {
    errors.push(
      `${skillName}/SKILL.md description + when_to_use is ${routingText.length} chars; keep it <= 1536`,
    )
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
  // A closing verification gate is deliberately not recommended: it restated the rule sections
  // almost item for item, and current models self-verify, so the third copy bought over-verification
  // rather than coverage.
  for (const requiredHeading of ['## Decision Gate']) {
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
