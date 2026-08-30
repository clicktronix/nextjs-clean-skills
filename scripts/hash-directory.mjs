import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const posix = (value) => value.split(path.sep).join('/')

async function filesUnder(root, directory = root) {
  const files = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await filesUnder(root, absolute)))
    else if (entry.isFile()) files.push(posix(path.relative(root, absolute)))
    else throw new Error(`Cannot hash non-file entry: ${absolute}`)
  }
  return files
}

/** Hashes the names and bytes of every regular file in a directory. */
export async function hashDirectory(root) {
  const hash = createHash('sha256')
  const files = (await filesUnder(root)).sort()
  for (const relative of files) {
    const content = await readFile(path.join(root, relative))
    hash.update(`${Buffer.byteLength(relative)}:${relative}\0${content.length}:`)
    hash.update(content)
    hash.update('\0')
  }
  return hash.digest('hex')
}
