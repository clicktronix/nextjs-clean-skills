#!/usr/bin/env node
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import fs from 'node:fs'
import path from 'node:path'
import { fail, parseFrontmatter, readJson, readText, root } from './_lib.mjs'

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }))
const validateFrontmatter = ajv.compile(readJson('schemas/skill-frontmatter.schema.json'))

const skillsRoot = path.join(root, 'plugins/nextjs-clean-skills/skills')
const expected = new Set(['nextjs-architecture', 'react-component-creator'])
const errors = []

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
  for (const match of text.matchAll(/\[[^\]]+\]\((references\/[^)]+\.md)\)/g)) {
    linkedReferences.add(match[1])
  }

  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)) {
    const linkPath = match[1]
    if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) continue
    const resolved = path.resolve(skillDir, linkPath)
    if (!fs.existsSync(resolved)) errors.push(`${skillName}/SKILL.md links missing ${linkPath}`)
  }

  const referenceDir = path.join(skillDir, 'references')
  if (fs.existsSync(referenceDir)) {
    const referenceFiles = fs.readdirSync(referenceDir).filter((name) => name.endsWith('.md'))
    for (const referenceFile of referenceFiles) {
      const referencePath = `references/${referenceFile}`
      if (!linkedReferences.has(referencePath)) {
        errors.push(`${skillName}/SKILL.md does not link ${referencePath}`)
      }
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

fail(errors)
console.log('skill frontmatter ok')
