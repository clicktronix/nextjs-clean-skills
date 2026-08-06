#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { fail, listFiles, root } from './_lib.mjs'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
const { default: mermaid } = await import('mermaid')

const docs = listFiles('docs', (file) => file.endsWith('.md')).sort()
// The mirrored copy under the plugin is what an installed user actually reads, and
// sync-plugin-contract rewrites its relative links. Byte-identity to the source proves the
// transform ran; only walking the copy's own links proves the transform produced valid ones.
const shipped = listFiles('plugins/nextjs-clean-skills/docs', (file) => file.endsWith('.md')).sort()
// plugins/nextjs-clean-skills/workflows/README.md links into docs/ and rules/; unchecked, a renamed
// section there would rot silently like any other doc in this repo.
const files = [
  'README.md',
  'rules/README.md',
  'plugins/nextjs-clean-skills/workflows/README.md',
  ...docs,
  ...shipped,
]
const errors = []
let diagramCount = 0
let linkCount = 0

const slugify = (heading) =>
  heading
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-')

const anchorsFor = (file) => {
  const anchors = new Set()
  const occurrences = new Map()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^#{1,6}\s+(.+)$/.exec(line)
    if (!match) continue
    const base = slugify(match[1].trim())
    const count = occurrences.get(base) ?? 0
    occurrences.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
  return anchors
}

const anchorCache = new Map()
const getAnchors = (file) => {
  if (!anchorCache.has(file)) anchorCache.set(file, anchorsFor(file))
  return anchorCache.get(file)
}

const isInsideRoot = (target) => {
  const relative = path.relative(root, target)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

const checkLink = (from, rawTarget) => {
  if (
    rawTarget.startsWith('http://') ||
    rawTarget.startsWith('https://') ||
    rawTarget.startsWith('mailto:') ||
    rawTarget.startsWith('app://')
  ) {
    return
  }

  const [rawPath, rawAnchor] = rawTarget.split('#', 2)
  let linkPath
  let anchor
  try {
    linkPath = decodeURIComponent(rawPath)
    anchor = rawAnchor ? decodeURIComponent(rawAnchor) : ''
  } catch {
    errors.push(`${from}: link is not valid URI encoding: ${rawTarget}`)
    return
  }

  const fromAbsolute = path.join(root, from)
  const target = linkPath ? path.resolve(path.dirname(fromAbsolute), linkPath) : fromAbsolute
  linkCount += 1

  if (!isInsideRoot(target)) {
    errors.push(`${from}: internal link leaves repository: ${rawTarget}`)
    return
  }

  if (!fs.existsSync(target)) {
    errors.push(`${from}: link target does not exist: ${rawTarget}`)
    return
  }

  if (!isInsideRoot(fs.realpathSync(target))) {
    errors.push(`${from}: internal link resolves outside repository: ${rawTarget}`)
    return
  }

  if (anchor && fs.statSync(target).isFile() && !getAnchors(target).has(anchor)) {
    errors.push(`${from}: link anchor does not exist: ${rawTarget}`)
  }
}

for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  const declaredDiagrams = text.match(/^```mermaid\s*$/gm)?.length ?? 0
  let parsedDiagrams = 0

  for (const match of text.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    checkLink(file, match[1])
  }

  for (const match of text.matchAll(/```mermaid\s*\n([\s\S]*?)\n```/g)) {
    const source = match[1].trim()
    parsedDiagrams += 1
    diagramCount += 1

    if (!/^flowchart TB(?:\n|$)/.test(source)) {
      errors.push(`${file}: Mermaid diagram ${diagramCount} must use vertical \`flowchart TB\``)
    }
    if (!/^\s*accTitle:\s*\S/m.test(source) || !/^\s*accDescr:\s*\S/m.test(source)) {
      errors.push(`${file}: Mermaid diagram ${diagramCount} needs accTitle and accDescr`)
    }
    if (source.includes('\\n')) {
      errors.push(`${file}: Mermaid diagram ${diagramCount} uses a literal \\n; use <br/>`)
    }

    try {
      await mermaid.parse(source)
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
      errors.push(`${file}: Mermaid diagram ${diagramCount} does not parse: ${message}`)
    }
  }

  if (parsedDiagrams !== declaredDiagrams) {
    errors.push(
      `${file}: found ${declaredDiagrams} Mermaid openings but parsed ${parsedDiagrams} closed diagrams`
    )
  }
}

const docsIndex = fs.readFileSync(path.join(root, 'docs/README.md'), 'utf8')
for (const file of docs) {
  if (file === 'docs/README.md') continue
  const relative = `./${path.basename(file)}`
  if (!docsIndex.includes(`](${relative})`)) {
    errors.push(`docs/README.md does not link ${relative}`)
  }
}

fail(errors)
console.log(`docs ok (${docs.length} files, ${linkCount} internal links, ${diagramCount} diagrams)`)
