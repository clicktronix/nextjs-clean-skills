import path from 'node:path'

/**
 * Migration census scope: every boundary rule as `warn` repo-wide, original severities only where
 * the code has moved. Usage and semantics: `rules/README.md`, "Census Scope".
 */

const demote = (setting) => {
  const [level, ...options] = Array.isArray(setting) ? setting : [setting]
  if (level !== 'error' && level !== 2) return setting
  return Array.isArray(setting) ? ['warn', ...options] : 'warn'
}

const GLOB_CHARS = /[*?[\]{}()!]/

// The restoring copy is written in repository coordinates. An entry with `basePath` reads its own
// `files` and `ignores` relative to that directory, so those patterns are prefixed with it: a
// literal prefix is exact for any glob, which rebasing the blocking globs onto it is not.
function rootPrefix(basePath) {
  if (basePath === undefined) return ''
  if (typeof basePath !== 'string' || basePath.startsWith('/')) {
    throw new Error(`censusScope: basePath "${basePath}" is not supported; use a path relative to the config directory`)
  }
  const base = path.posix.normalize(basePath).replace(/\/+$/, '')
  if (base === '.') return ''
  if (base === '..' || base.startsWith('../') || GLOB_CHARS.test(base)) {
    throw new Error(`censusScope: basePath "${basePath}" must be a literal directory inside the config directory`)
  }
  return `${base}/`
}

function rooted(prefix, pattern) {
  if (prefix === '') return pattern
  if (typeof pattern !== 'string') throw new Error('censusScope: only string patterns can be re-rooted from a basePath')
  const negated = pattern.startsWith('!')
  const glob = (negated ? pattern.slice(1) : pattern).replace(/^\.\//, '')
  return `${negated ? '!' : ''}${prefix}${glob}`
}

export function censusScope(configs, blockingFiles = []) {
  // One pass in the original order. A rule-bearing entry is emitted demoted, then followed by a
  // copy that restores its original rules on the blocking globs only. Everything else
  // (global ignores, parser, settings, plugins) is emitted once, in place, so later overrides keep
  // their meaning and severity is the only thing that changes.
  return configs.flatMap((config) => {
    if (!config.rules) return [config]
    const warn = {
      ...config,
      rules: Object.fromEntries(Object.entries(config.rules).map(([id, setting]) => [id, demote(setting)])),
    }
    if (blockingFiles.length === 0) return [warn]
    const prefix = rootPrefix(config.basePath)
    const own = (config.files ?? ['**/*']).map((pattern) =>
      Array.isArray(pattern) ? pattern.map((part) => rooted(prefix, part)) : [rooted(prefix, pattern)]
    )

    // A nested array in `files` is an AND: the entry applies to a file only if it matches both
    // globs, so the config's own `files` (test-file exemptions) stay in the intersection. Without
    // `basePath` the copy needs its own positive bound on that directory: a prefixed negation such
    // as `!base/**/x.js` still matches every file outside it.
    const inBase = prefix === '' ? [] : [`${prefix}**/*`]
    const restore = {
      files: blockingFiles.flatMap((glob) => own.map((patterns) => [glob, ...inBase, ...patterns])),
      ...(config.ignores ? { ignores: config.ignores.map((pattern) => rooted(prefix, pattern)) } : {}),
      rules: config.rules,
    }
    return [warn, restore]
  })
}
