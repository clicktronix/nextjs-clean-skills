#!/usr/bin/env node
// rules/ ships executable config, so this executes it. Earlier versions of this check were too
// weak in the same way: the first asserted the config's SHAPE, the second ran a hand-picked
// fixture list. Both certified real gaps — a hand-picked list cannot be complete by construction.
// So the matrix is GENERATED as a source x target cross-product from rules/import-table.json:
// every pair the table permits must lint clean, every pair it omits must error. Adding a layer
// adds its whole row and column automatically.
//
// The matrix now runs against three TIERS, because the contract has two enforcement mechanisms:
//
//   strings   — rules/eslint-boundaries.mjs alone. No dependencies; matches import strings.
//   resolved  — rules/eslint-boundaries-resolved.mjs alone. Needs eslint-plugin-import and a
//               resolver; compares resolved file paths.
//   composed  — both, which is how a project runs them.
//
// Tier one cannot express "this layer except one entry" (measured: gitignore-style negation in a
// `no-restricted-imports` group does not exempt the negated path, in any of three spellings), and
// cannot see a specifier assembled at runtime. Cases marked `resolvedOnly` in the table are those
// blind spots: they must lint CLEAN under `strings` and ERROR under `resolved` and `composed`. That
// makes the tier relationship machine-checked — tier one is a subset of tier two, never a
// contradiction of it.
//
// Plus one canary run: with the resolver stripped, an aliased forbidden import must still fail —
// as unresolvable. Without that, a misconfigured resolver turns every zone into a no-op that
// reports success (measured: with the node resolver alone, `@/`-aliased forbidden imports lint
// clean while the relative spelling still errors).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fail, listFiles, readJson, root } from './_lib.mjs'

const STRINGS = 'rules/eslint-boundaries.mjs'
const RESOLVED = 'rules/eslint-boundaries-resolved.mjs'

// Rules whose errors count as "the boundary held". `import/no-unresolved` is deliberately absent:
// it is the canary for tier two, asserted on its own below, and counting it here would let an
// unresolvable fixture masquerade as an enforced boundary.
const BOUNDARY_RULES = new Set([
  'no-restricted-imports',
  'no-restricted-syntax',
  'import/no-restricted-paths',
  'import/no-dynamic-require',
])

const errors = []
const modules = listFiles('rules', (file) => file.endsWith('.mjs'))
if (modules.length === 0) errors.push('rules/: no executable rule modules found')

const loaded = new Map()
for (const file of modules) {
  let blocks
  try {
    blocks = (await import(pathToFileURL(path.resolve(file)).href)).default
  } catch (error) {
    errors.push(`${file}: does not load (${error.message})`)
    continue
  }
  if (!Array.isArray(blocks) || blocks.length === 0) {
    errors.push(`${file}: default export must be a non-empty flat-config array`)
    continue
  }
  blocks.forEach((block, index) => {
    if (!Array.isArray(block?.files) || block.files.length === 0)
      errors.push(`${file}: block ${index} has no "files" globs`)
    if (!block?.rules || Object.keys(block.rules).length === 0)
      errors.push(`${file}: block ${index} declares no rules`)
  })
  loaded.set(file, blocks)

  // Flat config REPLACES a rule's options when a later block re-declares it for overlapping
  // files. A repo-wide block is therefore only safe if every narrower block repeats its
  // selectors — otherwise the narrower file set silently loses them. Assert that, rather than
  // banning the composition: a broad env rule plus per-layer additions is the shape we want.
  const selectorsOf = (block) =>
    new Set(
      (block.rules?.['no-restricted-syntax'] ?? [])
        .filter((entry) => typeof entry === 'object' && entry.selector)
        .map((entry) => entry.selector)
    )
  const syntaxBlocks = blocks.filter((block) => Array.isArray(block.rules?.['no-restricted-syntax']))
  const broad = syntaxBlocks.filter((block) =>
    block.files?.some((glob) => glob === 'src/**/*.{ts,tsx}')
  )
  for (const wide of broad) {
    const required = selectorsOf(wide)
    for (const narrow of syntaxBlocks) {
      if (narrow === wide) continue
      const have = selectorsOf(narrow)
      const missing = [...required].filter((selector) => !have.has(selector))
      if (missing.length > 0) {
        errors.push(
          `${file}: block for ${narrow.files.join(', ')} overrides the repo-wide no-restricted-syntax but drops ${missing.length} of its selectors. Flat config replaces rather than merges — repeat them or the narrower files lose the rule.`
        )
      }
    }
  }
}

const table = readJson('rules/import-table.json')
const layerNames = Object.keys(table.layers)
const rootOf = (name) => table.layers[name].root

// A root may be a glob — a use-case slice's `entries`/`operations` live at `src/use-cases/*/…`,
// one per slice — so the containment check matches segment-wise rather than by prefix.
const rootMatcher = (root) =>
  new RegExp(`^${root.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+')}(/|$)`)

for (const name of layerNames) {
  if (!rootOf(name)) errors.push(`rules/import-table.json: layer ${name} has no "root"`)
  else if (!rootMatcher(rootOf(name)).test(table.layers[name].dir))
    errors.push(
      `rules/import-table.json: layer ${name} has a "dir" (${table.layers[name].dir}) outside its "root" (${rootOf(name)})`
    )
}

// A nested layer has its own permissions (`read` lives inside `inbound`). Because flat config
// replaces rule options for overlapping file sets, a parent block that does not exclude the child
// would leave whichever block came last as the only one in force — silently.
const nestedPairs = layerNames.flatMap((child) =>
  layerNames
    .filter((parent) => parent !== child && rootOf(child).startsWith(`${rootOf(parent)}/`))
    .map((parent) => ({ child, parent }))
)
for (const { child, parent } of nestedPairs) {
  const block = (loaded.get(RESOLVED) ?? []).find(
    (candidate) =>
      candidate.rules?.['import/no-restricted-paths'] &&
      candidate.files?.includes(`${rootOf(parent)}/**/*.{ts,tsx}`)
  )
  if (!block) continue
  if (!(block.ignores ?? []).some((glob) => glob.startsWith(rootOf(child)))) {
    errors.push(
      `${RESOLVED}: the ${parent} block must ignore ${rootOf(child)} — ${child} nests inside it and has different permissions, and flat config would let one block replace the other.`
    )
  }
}

let ESLint
try {
  ;({ ESLint } = await import('eslint'))
} catch {
  errors.push('rules/: eslint is not installed, so the matrix cannot run. Add it as a devDependency.')
}

if (ESLint && errors.length === 0) {
  const cases = []

  // Generated cross-product: every (source, target) pair the table does or does not permit.
  for (const source of layerNames) {
    const allowed = new Set(table.layers[source].mayImport)
    const at = table.layers[source].mayImportAt ?? {}
    for (const target of new Set([...layerNames, ...Object.keys(table.specimen)])) {
      if (source === target) continue
      const specimen = table.specimen[target]
      if (!specimen) continue
      // A subpath permission ("app may import client-cache only at its prefetch entry") is granted
      // to a module, not a layer, so the expectation is read off the specimen rather than the row.
      const grantedAtSpecimen = (at[target] ?? []).some(
        (entry) => specimen.endsWith(`/${entry}`) || specimen.includes(`/${entry}/`)
      )
      const expect = allowed.has(target) || grantedAtSpecimen ? 'clean' : 'error'
      cases.push({
        dir: table.layers[source].dir,
        name: `from-${source}-to-${target}.ts`,
        code: `import { thing } from '${specimen}'\nexport default thing`,
        expect,
        layerEdge: true,
        label: `${source} -> ${target}`,
      })
      // The same edge written dynamically. Tier one cannot see these through the import rule, so
      // it carries selectors for them; tier two resolves them like any other specifier. The only
      // way to know either is complete is to generate the cases rather than hand-pick a few.
      if (expect === 'error') {
        for (const [prefix, spelling, code] of [
          ['dyn', 'import()', `export default () => import('${specimen}')`],
          ['req', 'require', `export default () => require('${specimen}')`],
        ]) {
          cases.push({
            dir: table.layers[source].dir,
            name: `${prefix}-${source}-to-${target}.ts`,
            code,
            expect,
            layerEdge: true,
            label: `${source} -> ${target} (${spelling})`,
          })
        }
      }
    }
  }
  for (const entry of table.extraForbidden)
    cases.push({
      dir: entry.dir ?? table.layers[entry.layer].dir,
      name: `forbid-${cases.length}.ts`,
      code: entry.code,
      expect: 'error',
      resolvedOnly: entry.resolvedOnly === true,
      label: entry.case,
    })
  // Reference examples, linted as the files they claim to be. This is the class the contract-sync
  // check cannot see — it reads the layer table, not the code fences — and it shipped twice: an
  // example that violated the very rule its reference states. A fence opts in by naming its path;
  // `expect=error` marks a deliberate counter-example.
  const FENCE = /```ts path=(\S+?)(?: expect=(error))?\n([\s\S]*?)```/g
  for (const file of listFiles('plugins', (name) => name.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(root, file), 'utf8')
    for (const [, target, expectError, code] of text.matchAll(FENCE)) {
      if (!target.startsWith('src/')) {
        errors.push(`${file}: example path "${target}" must be under src/ to be placed in a layer`)
        continue
      }
      cases.push({
        dir: path.dirname(target),
        name: path.basename(target),
        code: code.trimEnd(),
        expect: expectError ? 'error' : 'clean',
        label: `example ${file.split('/').pop()} -> ${target}`,
      })
    }
  }

  for (const entry of table.extraAllowed)
    cases.push({
      dir: entry.dir ?? table.layers[entry.layer].dir,
      name: `allow-${cases.length}.ts`,
      code: entry.code,
      expect: 'clean',
      label: entry.case,
    })

  // The tier a case runs in, and what it must do there. `resolvedOnly` cases document a measured
  // tier-one blind spot: clean there, rejected once the resolved tier is present.
  const expectIn = (tier, testCase) =>
    testCase.resolvedOnly ? (tier === 'strings' ? 'clean' : 'error') : testCase.expect
  // The resolved tier owns project-internal paths: drivers, builtins and environment reads are
  // tier one's job. Which extras qualify is DERIVED from their code — every specifier is an alias
  // or a relative path — rather than hand-flagged. A hand-flagged list let a subpath rule ship
  // untested: it was caught only by tier one, and deleting the tier-two zone changed nothing.
  const SPECIFIER = /from '([^']+)'|import\('([^']+)'\)|require\('([^']+)'\)/g
  const projectOnly = (testCase) => {
    const specifiers = [...testCase.code.matchAll(SPECIFIER)].map((m) => m[1] ?? m[2] ?? m[3])
    return specifiers.length > 0 && specifiers.every((s) => s.startsWith('@/') || s.startsWith('.'))
  }
  for (const testCase of cases) testCase.projectOnly = projectOnly(testCase)

  const runsIn = (tier, testCase) =>
    tier === 'resolved'
      ? testCase.layerEdge === true || testCase.resolvedOnly === true || testCase.projectOnly
      : true

  // Reference examples are TypeScript. The shipped rule files stay parser-agnostic; the parser is
  // added here, in the sandbox wrapper, so the matrix can lint real examples.
  const PARSER = `import parser from '@typescript-eslint/parser'\nconst ts = { files: ['**/*.{ts,tsx}'], languageOptions: { parser } }\n`

  const TIERS = {
    strings: `${PARSER}import strings from './eslint-boundaries.mjs'\nexport default [ts, ...strings]\n`,
    resolved: `${PARSER}import resolved from './eslint-boundaries-resolved.mjs'\nexport default [ts, ...resolved]\n`,
    composed: `${PARSER}import strings from './eslint-boundaries.mjs'\nimport resolved from './eslint-boundaries-resolved.mjs'\nexport default [ts, ...strings, ...resolved]\n`,
    // A project that installs the zones but no alias resolver. Not a supported setup — a run that
    // proves it fails loudly instead of passing everything. The resolver is REPLACED inside the
    // block that declares it: appending an override would not work, because flat config merges
    // `settings` and the TypeScript resolver would survive — which is how the first version of
    // this canary tested nothing.
    'no-resolver': `${PARSER}import resolved from './eslint-boundaries-resolved.mjs'\nexport default [ts, ...resolved].map((block) =>\n  block.settings?.['import/resolver']\n    ? { ...block, settings: { ...block.settings, 'import/resolver': { node: { extensions: ['.ts', '.tsx'] } } } }\n    : block\n)\n`,
  }

  // realpath: mkdtemp hands back /var/... on macOS while ESLint reports /private/var/..., and the
  // results are indexed by path.
  const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rules-matrix-')))
  try {
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir')
    fs.copyFileSync(path.join(root, STRINGS), path.join(sandbox, path.basename(STRINGS)))
    fs.copyFileSync(path.join(root, RESOLVED), path.join(sandbox, path.basename(RESOLVED)))
    // The resolved config derives its zones from the table at load time, so the table travels
    // with it — as it must when a project copies the pair in.
    fs.copyFileSync(
      path.join(root, 'rules/import-table.json'),
      path.join(sandbox, 'import-table.json')
    )
    fs.writeFileSync(
      path.join(sandbox, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            paths: { '@/*': ['./src/*'] },
            module: 'esnext',
            moduleResolution: 'bundler',
            target: 'esnext',
            allowJs: true,
          },
          include: ['src'],
        },
        null,
        2
      )}\n`
    )
    for (const [tier, config] of Object.entries(TIERS))
      fs.writeFileSync(path.join(sandbox, `eslint.config.${tier}.mjs`), config)

    const canary = {
      dir: table.layers['use-case-operations'].dir,
      name: 'canary-aliased-forbidden-edge.ts',
      code: `import { thing } from '${table.specimen.outbound}'\nexport default thing`,
      label: 'canary: aliased forbidden edge with no resolver',
    }

    const write = (testCase) => {
      const absolute = path.join(sandbox, testCase.dir, testCase.name)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, `${testCase.code}\n`)
      return absolute
    }
    const fixtures = new Set([...cases, canary].map(write))

    // Every specifier a fixture names must exist on disk, or the canary rule (no-unresolved)
    // fires on fixtures that were never about resolution. Derived from the fixture code, so a
    // new case cannot forget its target.
    for (const testCase of [...cases, canary]) {
      const specifiers = [
        ...testCase.code.matchAll(/from '([^']+)'|import\('([^']+)'\)|require\('([^']+)'\)/g),
      ].map((match) => match[1] ?? match[2] ?? match[3])
      for (const specifier of specifiers) {
        let target
        if (specifier.startsWith('@/')) target = path.join(sandbox, 'src', specifier.slice(2))
        else if (specifier.startsWith('.'))
          target = path.resolve(sandbox, testCase.dir, path.dirname(testCase.name), specifier)
        else continue
        // A specifier that names a layer root (`@/boundary`) is that layer's barrel, so it has to
        // live INSIDE the root as `index.ts`. Written as `boundary.ts` it sits next to the layer
        // instead of in it, and every zone pointed at the directory would miss it — the fixture
        // would report the boundary open when the config is fine.
        const isLayerRoot = layerNames.some(
          (name) => path.join(sandbox, rootOf(name)) === target
        )
        const file = isLayerRoot ? path.join(target, 'index.ts') : `${target}.ts`
        if (fixtures.has(file) || fs.existsSync(file)) continue
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, 'export const thing = 1\nexport default thing\n')
      }
    }

    // `import/no-restricted-paths` resolves its zone paths against `process.cwd()`, not against
    // ESLint's `cwd` option — which is also why a project must run ESLint from its root. The
    // matrix has to reproduce that, or the zones point outside the sandbox and reject nothing.
    process.chdir(sandbox)

    const lint = async (tier) => {
      const eslint = new ESLint({
        cwd: sandbox,
        overrideConfigFile: path.join(sandbox, `eslint.config.${tier}.mjs`),
      })
      const results = await eslint.lintFiles([path.join(sandbox, 'src')])
      return new Map(results.map((result) => [result.filePath, result.messages]))
    }

    let checked = 0
    for (const tier of ['strings', 'resolved', 'composed']) {
      const messagesByPath = await lint(tier)
      for (const testCase of cases) {
        if (!runsIn(tier, testCase)) continue
        const absolute = path.join(sandbox, testCase.dir, testCase.name)
        if (!messagesByPath.has(absolute)) {
          errors.push(
            `rules matrix [${tier}]: ${testCase.label} was never linted — no config block matched ${testCase.dir}/${testCase.name}, so its result proves nothing.`
          )
          continue
        }
        const messages = messagesByPath.get(absolute)
        checked += 1

        // A parse failure produces a message but proves nothing about the boundary. Counting it
        // as a pass is how a broken fixture masquerades as an enforced rule.
        const fatal = messages.filter((message) => message.fatal)
        if (fatal.length > 0) {
          errors.push(`rules matrix [${tier}]: ${testCase.label} failed to parse — ${fatal[0].message}`)
          continue
        }
        const held = messages.filter(
          (message) => message.severity === 2 && BOUNDARY_RULES.has(message.ruleId)
        )
        const expected = expectIn(tier, testCase)
        if (expected === 'clean' && held.length > 0) {
          errors.push(
            `rules matrix [${tier}]: ${testCase.label} must lint clean here but was rejected — ${held[0].ruleId}: ${held[0].message}`
          )
        }
        if (expected === 'error' && held.length === 0) {
          errors.push(`rules matrix [${tier}]: ${testCase.label} must be rejected, but linted clean`)
        }
      }
    }

    // The canary. Same file, same zones, resolver removed.
    const canaryPath = path.join(sandbox, canary.dir, canary.name)
    const withResolver = (await lint('resolved')).get(canaryPath) ?? []
    const withoutResolver = (await lint('no-resolver')).get(canaryPath) ?? []
    const ruleIds = (messages) => new Set(messages.map((message) => message.ruleId))
    if (!ruleIds(withResolver).has('import/no-restricted-paths')) {
      errors.push(
        `rules matrix [resolved]: the zones did not reject an aliased forbidden edge. Either the resolver is not working in the sandbox or ${RESOLVED} no longer covers ${canary.label}.`
      )
    }
    if (!ruleIds(withoutResolver).has('import/no-unresolved')) {
      errors.push(
        `rules matrix [no-resolver]: with the resolver removed, the aliased forbidden edge produced no error at all. import/no-unresolved is the only thing standing between a broken resolver and a boundary that silently passes everything — it must stay declared in ${RESOLVED}.`
      )
    }
    if (ruleIds(withoutResolver).has('import/no-restricted-paths')) {
      errors.push(
        `rules matrix [no-resolver]: the zones rejected an unresolvable specifier, which they could not do when this check was written. Good news, but it means the canary's justification has changed — re-measure before relying on it.`
      )
    }

    if (errors.length === 0)
      console.log(
        `rules ok (${modules.length} modules, ${cases.length} cases x 3 tiers = ${checked} assertions, + resolver canary)`
      )
  } finally {
    process.chdir(root)
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

fail(errors)
