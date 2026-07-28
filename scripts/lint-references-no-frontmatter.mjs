#!/usr/bin/env node
import { fail, listFiles, readText } from './_lib.mjs'

const files = listFiles('plugins/nextjs-clean-skills/skills', (file) =>
  file.includes('/references/') && file.endsWith('.md')
)

// A reference declares how far its rule travels. "portable" survives a change of framework,
// store, or vendor; "stack (...)" does not. The distinction is load-bearing: a rule tagged
// portable that names a vendor is either mis-tagged or secretly stack-specific, and adopters on
// a different stack will either follow it wrongly or discard the portable part with it.
const SCOPE_RE = /^\*\*Impact: [A-Z]+\*\* · \*\*Scope: (portable|stack \([^)]+\))\*\*$/m
// Vendor names AND framework concepts: a portable rule stated as "Route Handler only" is just as
// stack-bound as one that says "Next.js", and the first form is the one that slips through review.
const VENDOR_RE =
  /\b(supabase|postgres|postgrest|next\.js|tanstack|mantine|sentry|valibot|zustand|playwright|server actions?|route handlers?|server components?|app router|use client|use server|rsc)\b/i

const errors = []
for (const file of files) {
  const text = readText(file)
  if (text.startsWith('---\n')) errors.push(`${file}: references must not contain YAML frontmatter`)
  if (!text.startsWith('# ')) errors.push(`${file}: reference must start with a level-1 heading`)
  if (text.length > 2600) errors.push(`${file}: reference is too long; keep atomic rules concise`)

  const scope = SCOPE_RE.exec(text)
  if (!scope) {
    errors.push(
      `${file}: missing "**Impact: X** · **Scope: portable|stack (...)**" line under the heading`
    )
  } else if (scope[1] === 'portable') {
    // Scan examples too. Stripping fences let a portable rule state itself in framework
    // vocabulary inside the very snippet an agent copies — the part most likely to be imitated.
    const vendor = VENDOR_RE.exec(text)
    if (vendor) {
      errors.push(
        `${file}: tagged portable but names "${vendor[1]}". State the rule stack-neutrally, or retag it as stack (...) and keep the portable half in its own reference.`
      )
    }
  }

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
