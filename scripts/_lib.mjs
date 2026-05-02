import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

export const root = process.cwd()

export function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
}

export function writeJson(file, value) {
  fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`)
}

export function readText(file) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

export function listFiles(dir, predicate = () => true) {
  const absolute = path.join(root, dir)
  if (!fs.existsSync(absolute)) return []
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(relative, predicate)
    return predicate(relative) ? [relative] : []
  })
}

export function fail(messages) {
  if (messages.length === 0) return
  for (const message of messages) console.error(message)
  process.exit(1)
}

export function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return null
  try {
    const parsed = parseYaml(match[1])
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
