#!/usr/bin/env node
/**
 * Detects duplicated prose across SKILL.md files and their references.
 *
 * Strategy:
 * 1. Exact-line match for long prose lines (catches verbatim copy/paste).
 * 2. Word-shingle (5-gram) Jaccard similarity per paragraph for paraphrase
 *    detection. Threshold > 0.85 = error (near-duplicate), > 0.70 = warning
 *    (high overlap; reviewer should confirm intent).
 *
 * Comparison scope is cross-file only — repetition inside one file is allowed
 * (a skill may legitimately echo the same definition in two sections).
 */

import { fail, listFiles, readText } from './_lib.mjs'

const SHINGLE_SIZE = 5
const ERROR_THRESHOLD = 0.85
const WARNING_THRESHOLD = 0.7
const MIN_TOKENS_FOR_COMPARISON = 12

const files = listFiles('plugins/nextjs-clean-skills/skills', (file) => file.endsWith('.md'))

function normalizeLine(line) {
  return line
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isProseLine(line) {
  return line.length > 80 && !line.startsWith('|') && !line.startsWith('```')
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function shingle(tokens, size = SHINGLE_SIZE) {
  if (tokens.length < size) return new Set()
  const shingles = new Set()
  for (let i = 0; i <= tokens.length - size; i++) {
    shingles.add(tokens.slice(i, i + size).join(' '))
  }
  return shingles
}

function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const item of setA) if (setB.has(item)) intersection++
  return intersection / (setA.size + setB.size - intersection)
}

function paragraphsOf(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !paragraph.startsWith('|'))
}

const errors = []
const warnings = []

// Pass 1 — exact long-line dedup (cheap; catches verbatim copy/paste).
const seenLines = new Map()
for (const file of files) {
  for (const line of readText(file).split('\n')) {
    const trimmed = line.trim()
    if (!isProseLine(trimmed)) continue
    const normalized = normalizeLine(trimmed)
    const previous = seenLines.get(normalized)
    if (previous && previous !== file) {
      errors.push(`Duplicate long line in ${previous} and ${file}: ${trimmed}`)
    } else {
      seenLines.set(normalized, file)
    }
  }
}

// Pass 2 — paragraph-level similarity (catches paraphrase / reorder).
const fingerprints = []
for (const file of files) {
  for (const paragraph of paragraphsOf(readText(file))) {
    const tokens = tokenize(paragraph)
    if (tokens.length < MIN_TOKENS_FOR_COMPARISON) continue
    const shingles = shingle(tokens)
    if (shingles.size === 0) continue
    fingerprints.push({ file, paragraph, shingles })
  }
}

const reported = new Set()
for (let i = 0; i < fingerprints.length; i++) {
  for (let j = i + 1; j < fingerprints.length; j++) {
    const a = fingerprints[i]
    const b = fingerprints[j]
    if (a.file === b.file) continue
    const similarity = jaccard(a.shingles, b.shingles)
    if (similarity < WARNING_THRESHOLD) continue
    const key = `${a.file}::${b.file}::${a.paragraph.slice(0, 40)}::${b.paragraph.slice(0, 40)}`
    if (reported.has(key)) continue
    reported.add(key)

    const summaryA = a.paragraph.slice(0, 120).replace(/\s+/g, ' ')
    const summaryB = b.paragraph.slice(0, 120).replace(/\s+/g, ' ')
    const message = `Similar prose (Jaccard=${similarity.toFixed(2)})\n  ${a.file}: ${summaryA}\n  ${b.file}: ${summaryB}`

    if (similarity >= ERROR_THRESHOLD) errors.push(message)
    else warnings.push(message)
  }
}

for (const warning of warnings) console.warn(`warn: ${warning}`)
fail(errors)
console.log(`content duplication ok (${warnings.length} warnings)`)
