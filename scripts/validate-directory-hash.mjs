#!/usr/bin/env node
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { hashDirectory } from './hash-directory.mjs'

const root = await mkdtemp(path.join(tmpdir(), 'nextjs-clean-provenance-'))
try {
  await mkdir(path.join(root, 'one', 'references'), { recursive: true })
  await mkdir(path.join(root, 'two', 'references'), { recursive: true })
  await writeFile(path.join(root, 'one', 'SKILL.md'), 'body\n')
  await writeFile(path.join(root, 'one', 'references', 'rule.md'), 'rule\n')
  // Creation order is not identity; paths and bytes are.
  await writeFile(path.join(root, 'two', 'references', 'rule.md'), 'rule\n')
  await writeFile(path.join(root, 'two', 'SKILL.md'), 'body\n')

  const original = await hashDirectory(path.join(root, 'one'))
  const reordered = await hashDirectory(path.join(root, 'two'))
  if (original !== reordered) throw new Error('directory hash depends on file creation order')

  await writeFile(path.join(root, 'two', 'references', 'rule.md'), 'changed\n')
  if (original === (await hashDirectory(path.join(root, 'two')))) {
    throw new Error('directory hash ignores referenced file content')
  }

  await writeFile(path.join(root, 'two', 'references', 'rule.md'), 'rule\n')
  await mkdir(path.join(root, 'two', 'renamed'), { recursive: true })
  await writeFile(path.join(root, 'two', 'renamed', 'rule.md'), 'rule\n')
  await rm(path.join(root, 'two', 'references', 'rule.md'))
  if (original === (await hashDirectory(path.join(root, 'two')))) {
    throw new Error('directory hash ignores referenced file paths')
  }

  await symlink('SKILL.md', path.join(root, 'one', 'alias.md'))
  let rejectedSymlink = false
  try {
    await hashDirectory(path.join(root, 'one'))
  } catch (error) {
    rejectedSymlink = error.message.includes('Cannot hash non-file entry')
  }
  if (!rejectedSymlink) throw new Error('directory hash must reject symlinks')
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('directory hash ok (paths and contents bound; symlinks rejected)')
