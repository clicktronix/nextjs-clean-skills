/**
 * Migration census scope: every boundary rule as `warn` repo-wide, original severities only where
 * the code has moved. Usage and semantics: `rules/README.md`, "Census Scope".
 */

const demote = (setting) => {
  const [level, ...options] = Array.isArray(setting) ? setting : [setting]
  if (level !== 'error' && level !== 2) return setting
  return Array.isArray(setting) ? ['warn', ...options] : 'warn'
}

export function censusScope(configs, blockingFiles = []) {
  const warn = configs.map((config) =>
    config.rules
      ? { ...config, rules: Object.fromEntries(Object.entries(config.rules).map(([id, setting]) => [id, demote(setting)])) }
      : config
  )
  if (blockingFiles.length === 0) return warn

  // A nested array in `files` is an AND: the entry applies to a file only if it matches both globs.
  // Keeping each config's own `files` in the intersection preserves its test-file exemptions; the
  // rest of the config (`ignores`, `settings`, `languageOptions`, `plugins`) is carried over as is,
  // so the gate sees each file the way the census does.
  const blocking = configs
    .filter((config) => config.rules)
    .map((config) => ({
      ...config,
      files: blockingFiles.flatMap((glob) =>
        (config.files ?? ['**/*']).map((own) => [glob, ...(Array.isArray(own) ? own : [own])])
      ),
    }))
  return [...warn, ...blocking]
}
