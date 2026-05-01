#!/usr/bin/env node
import { fail, listFiles, readText } from './_lib.mjs'

const files = listFiles('plugins/nextjs-clean-skills/skills', (file) =>
  file.includes('/references/') && file.endsWith('.md')
)

const errors = []
for (const file of files) {
  const text = readText(file)
  if (text.startsWith('---\n')) errors.push(`${file}: references must not contain YAML frontmatter`)
  if (!text.startsWith('# ')) errors.push(`${file}: reference must start with a level-1 heading`)
  if (text.length > 2600) errors.push(`${file}: reference is too long; keep atomic rules concise`)

  let insideCodeBlock = false
  let codeBlockStartLine = 0
  let codeBlockLineCount = 0
  text.split('\n').forEach((line, index) => {
    if (line.startsWith('```')) {
      if (insideCodeBlock && codeBlockLineCount > 10) {
        errors.push(
          `${file}:${codeBlockStartLine}: code block has ${codeBlockLineCount} lines; keep reference examples compact`
        )
      }
      insideCodeBlock = !insideCodeBlock
      codeBlockStartLine = index + 1
      codeBlockLineCount = 0
      return
    }
    if (insideCodeBlock) codeBlockLineCount += 1
  })
}

fail(errors)
console.log(`references ok (${files.length})`)
