/**
 * Resolved-path layer boundaries — the second enforcement tier for the architecture in
 * `plugins/nextjs-clean-skills`. Requires `eslint-plugin-import` and a resolver that
 * understands the project's path aliases; `eslint-config-next` already supplies both
 * (`import/resolver: { node, typescript }`), so in a Next.js project this costs no new
 * dependency.
 *
 * Why a second tier. `eslint-boundaries.mjs` matches the import STRING, so it needs every
 * spelling of a layer enumerated and it cannot express "this subtree except that one".
 * `import/no-restricted-paths` compares RESOLVED file paths, which makes it alias-agnostic
 * and gives it `except` for carve-outs. Measured on a fixture project, the zones below
 * catch a forbidden edge written as an alias, as a relative path, through `import()`, and
 * through `require()`.
 *
 * The zones are DERIVED from `rules/import-table.json` — the same table the string tier and
 * the matrix use. There is no second copy of the contract to drift.
 *
 * TWO PREREQUISITES, both load-bearing:
 *
 *   1. A resolver for the alias. Without one, every `@/...` specifier fails to resolve and
 *      `no-restricted-paths` SILENTLY SKIPS IT — measured: with the node resolver alone, a
 *      forbidden aliased import lints clean while the relative spelling still errors. A
 *      half-configured resolver is worse than no rule, because it reports success.
 *   2. `import/no-unresolved`, declared below, is what makes that failure loud instead of
 *      silent: if the resolver stops resolving the alias, the import errors as unresolvable
 *      rather than passing as permitted. It is the canary for tier two, not a style rule.
 *      Measured against a production Next.js app: zero false positives across 40 files
 *      importing CSS modules, `.json`, and package CSS — the node and TypeScript resolvers
 *      cover those between them.
 *
 * Spread this AFTER the base configs (its `import/resolver` setting must win) and after
 * `eslint-boundaries.mjs`. Run ESLint from the project root: zone paths, like the string
 * tier's globs, are relative to the working directory.
 */

import fs from 'node:fs'
import path from 'node:path'

import importPlugin from 'eslint-plugin-import'

const table = JSON.parse(fs.readFileSync(new URL('./import-table.json', import.meta.url), 'utf8'))
const layers = table.layers
const names = Object.keys(layers)

const root = (name) => layers[name].root
/** Layer nesting, derived from the roots — `read` lives inside `inbound`. */
// A root containing a glob (`src/use-cases/*/entries`, one per slice) only matches files beneath
// it when the pattern says so explicitly; a plain directory root matches its subtree already.
const zonePath = (name) => (root(name).includes('*') ? `./${root(name)}/**` : `./${root(name)}`)
const isInside = (child, parent) => child !== parent && root(child).startsWith(`${root(parent)}/`)
const nestedIn = (parent) => names.filter((name) => isInside(name, parent))

const zonesFor = (source) => {
  const allowed = new Set([
    ...layers[source].mayImport,
    ...(layers[source].mayImportSelf ? [source] : []),
  ])
  const grantedAt = layers[source].mayImportAt ?? {}
  return (
    names
      .filter((target) => !allowed.has(target))
      // A forbidden ancestor's zone already covers everything nested inside it. Emitting the
      // child too would be redundant, and redundant zones hide which one is doing the work.
      .filter(
        (target) =>
          !names.some(
            (ancestor) =>
              ancestor !== source && isInside(target, ancestor) && !allowed.has(ancestor)
          )
      )
      .map((target) => {
        // A subpath permission: the layer is closed except at the named entries. This is the
        // thing a string pattern cannot say at all — gitignore-style negation in a
        // `no-restricted-imports` group does not exempt the negated path, so tier one can only
        // ban the entries it knows by name while tier two states the actual rule.
        const entries = grantedAt[target] ?? []
        if (entries.length > 0) {
          return {
            target: zonePath(source),
            from: `./${root(target)}/**`,
            // `except` must be globs when `from` is one.
            except: entries.flatMap((entry) => [
              `**/${entry}.ts`,
              `**/${entry}.tsx`,
              `**/${entry}/**`,
            ]),
            message: `${source} may reach ${target} only at its ${entries.join(', ')} entry. See references/placement/layers-and-imports.md.`,
          }
        }
        // The parent layer is reachable but a layer nested inside it is not, or vice versa.
        const except = nestedIn(target)
          .filter((nested) => allowed.has(nested))
          .map((nested) => `./${path.relative(root(target), root(nested))}`)
        return {
          target: zonePath(source),
          from: zonePath(target),
          ...(except.length > 0 ? { except } : {}),
          message: `${source} may import ${layers[source].mayImport.join(', ') || 'nothing'} — not ${target}. See references/placement/layers-and-imports.md.`,
        }
      })
  )
}

const sourceBlocks = names
  .map((source) => ({ source, zones: zonesFor(source) }))
  .filter(({ zones }) => zones.length > 0)
  .map(({ source, zones }) => {
    const nested = nestedIn(source)
    return {
      files: [`${root(source)}/**/*.{ts,tsx}`],
      // A nested layer has its own permissions. Without this the parent's zones would also
      // apply to it, and — because flat config REPLACES rule options for overlapping files —
      // whichever block came last would silently be the only one in force.
      ...(nested.length > 0 ? { ignores: nested.map((name) => `${root(name)}/**`) } : {}),
      rules: { 'import/no-restricted-paths': ['error', { zones }] },
    }
  })

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      },
    },
    rules: {
      // The canary — see the header. Without it a broken resolver turns every zone into a
      // no-op that reports success.
      'import/no-unresolved': ['error', { commonjs: true }],
      // Closes the last spelling neither tier can resolve: a specifier computed at runtime.
      // `import(name)`, `import('../' + name)`, `` import(`../${name}`) `` — all rejected
      // outright, so there is no specifier a boundary check cannot see.
      'import/no-dynamic-require': ['error', { esmodule: true }],
    },
  },

  ...sourceBlocks,

  // Tests reach across layers on purpose — fixtures, doubles, and in-memory adapters.
  {
    files: ['**/__tests__/**/*', '**/*.test.{ts,tsx}'],
    rules: { 'import/no-restricted-paths': 'off' },
  },
]
