#!/usr/bin/env node
import { fail, listFiles, readText } from './_lib.mjs'

const files = [
  'README.md',
  ...listFiles('plugins/nextjs-clean-skills/skills', (file) => file.endsWith('.md')),
]

const banned = [
  ['experimental.cacheComponents', 'Use stable cacheComponents in Next.js 16 docs.'],
  ['BaseSchema', 'Use Standard Schema-compatible types instead of Valibot BaseSchema.'],
  ['.schema(', 'Use next-safe-action .inputSchema().'],
  ["revalidateTag(tag)", "Use revalidateTag(tag, 'max') in new guidance."],
  ['Server data (fetched, cached, revalidated)', 'Split RSC reads from client-interactive server state.'],
  ['Smart/Dumb React components', 'Use Server/Client boundary language instead of old CSR-only framing.'],
]

const errors = []
for (const file of files) {
  const text = readText(file)
  const guidanceText = text.replace(/\*\*Incorrect[\s\S]*?```[\s\S]*?```/g, '')
  for (const [needle, message] of banned) {
    if (guidanceText.includes(needle)) errors.push(`${file}: banned phrase "${needle}". ${message}`)
  }
}

fail(errors)
console.log('skill markdown ok')
