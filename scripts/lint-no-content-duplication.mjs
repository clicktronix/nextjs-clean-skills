#!/usr/bin/env node
import { fail, listFiles, readText } from './_lib.mjs'

const files = listFiles('plugins/nextjs-clean-skills/skills', (file) => file.endsWith('.md'))
const seen = new Map()
const errors = []

for (const file of files) {
  const lines = readText(file)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 80 && !line.startsWith('|') && !line.startsWith('```'))

  for (const line of lines) {
    const normalized = line.toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ')
    const previous = seen.get(normalized)
    if (previous && previous !== file) {
      errors.push(`Duplicate long line in ${previous} and ${file}: ${line}`)
    } else {
      seen.set(normalized, file)
    }
  }
}

fail(errors)
console.log('content duplication ok')
