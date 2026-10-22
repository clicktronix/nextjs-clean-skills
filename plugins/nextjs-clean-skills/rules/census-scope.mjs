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

// Blocking globs are repository-relative; an entry with `basePath` reads its `files` relative to
// that directory, so the globs are re-expressed against it. A glob outside the directory cannot
// match anything there and is dropped.
function relativeToBase(glob, basePath) {
  const base = basePath.replace(/^\.\//, '').replace(/\/+$/, '')
  if (base === '' || base === '.') return glob
  if (glob.startsWith('**')) return glob
  if (glob.startsWith(`${base}/`)) return glob.slice(base.length + 1)
  const first = glob.split('/')[0]
  if (GLOB_CHARS.test(first)) {
    throw new Error(`censusScope: cannot translate blocking glob "${glob}" against basePath "${basePath}"; start it with a literal directory or "**"`)
  }
  return null
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
    if (typeof config.basePath === 'string' && config.basePath.startsWith('/')) {
      throw new Error(`censusScope: absolute basePath "${config.basePath}" is not supported; use a path relative to the config directory`)
    }
    const globs = blockingFiles
      .map((glob) => (config.basePath ? relativeToBase(glob, config.basePath) : glob))
      .filter((glob) => glob !== null)
    if (globs.length === 0) return [warn]

    // A nested array in `files` is an AND: the entry applies to a file only if it matches both
    // globs, so the config's own `files` (test-file exemptions) stay in the intersection.
    const restore = {
      ...(config.basePath ? { basePath: config.basePath } : {}),
      files: globs.flatMap((glob) =>
        (config.files ?? ['**/*']).map((own) => [glob, ...(Array.isArray(own) ? own : [own])])
      ),
      ...(config.ignores ? { ignores: config.ignores } : {}),
      rules: config.rules,
    }
    return [warn, restore]
  })
}
