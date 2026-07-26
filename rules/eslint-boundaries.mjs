/**
 * Executable layer boundaries for the architecture in `plugins/nextjs-clean-skills`.
 *
 * Copy into a consuming project and spread into its flat ESLint config, after the base configs.
 *
 * The contract these encode is `references/placement/layers-and-imports.md`; the machine-readable
 * copy is `rules/import-table.json`. `npm run validate` generates a source x target matrix from
 * that table — static, `import()` and `require()` spellings of every pair — so a permitted edge
 * that errors and a forbidden edge that passes are both build failures.
 *
 * The measured reason any of this exists: of two products on this architecture, the one with
 * path-scoped import rules had zero application files importing a concrete adapter; the one
 * without had the layer bypassed in 68 places (`docs/evidence.md`).
 *
 * Three traps this file already fell into, all now guarded by the validator:
 *   - Flat config REPLACES a rule's options when a later block re-declares it for overlapping
 *     files. A repo-wide `no-restricted-syntax` beside per-layer ones silently kills them, so
 *     every block repeats the shared selectors and the validator asserts it.
 *   - `no-restricted-imports` matches the import STRING, so each layer is named four ways:
 *     alias and bare suffix, each as an exact root and as a subtree.
 *   - Bare Node builtin names collide with layer names — Node ships a `domain` module — so they
 *     go in `paths` (exact match), never in `patterns` (segment match).
 */

import { builtinModules } from 'node:module'

const layer = (name) => [`@/${name}`, `@/${name}/**`, `**/${name}`, `**/${name}/**`]

const NODE_BUILTIN_PATHS = builtinModules.map((name) => ({
  name,
  message: 'Reach the outside through a data module or a port, never a Node builtin.',
}))
const NODE_BUILTIN_PATTERNS = builtinModules.map((name) => `node:${name}`)

const FRAMEWORK = ['next', 'next/**', 'react', 'react-dom', 'react/**', '@tanstack/**']

const DRIVERS = [
  '@supabase/*',
  '@supabase/**',
  'pg',
  'pg/**',
  'postgres',
  'mysql2',
  'mongodb',
  'redis',
  'ioredis',
  '@prisma/*',
  'drizzle-orm',
  'drizzle-orm/**',
]

// Every spelling of the same environment read: member, computed, template key, via globalThis.
const ENV_SELECTORS = [
  "MemberExpression[object.name='process'][property.name='env']",
  "MemberExpression[computed=true][object.name='process'][property.value='env']",
  "MemberExpression[computed=true][object.name='process'] > TemplateLiteral > TemplateElement[value.raw='env']",
  "MemberExpression[property.name='env'] > MemberExpression[property.name='process']",
  "MemberExpression[property.name='env'] > MemberExpression[computed=true][property.value='process']",
  "MemberExpression[computed=true][property.value='env'] > MemberExpression[property.name='process']",
  "MemberExpression[computed=true][property.value='env'] > MemberExpression[computed=true][property.value='process']",
].map((selector) => ({
  selector,
  message: 'Read environment variables through the validated env module.',
}))

// `no-restricted-imports` sees only static declarations. These cover the same edge written as
// `import()` or `require()`, with a plain string or a substitution-free template literal. The
// segment must end the specifier or be followed by a slash, so an exact layer root is caught too.
const dynamic = (names) =>
  names.flatMap((name) => {
    const escaped = name.replaceAll('/', String.raw`\/`)
    const pattern = String.raw`\/${escaped}(\/|$)`
    const message =
      'Dynamic load of a forbidden layer. The boundary applies to import() and require() too.'
    return [
      { selector: `ImportExpression > Literal[value=/${pattern}/]`, message },
      { selector: `CallExpression[callee.name='require'] > Literal[value=/${pattern}/]`, message },
      {
        selector: `ImportExpression > TemplateLiteral > TemplateElement[value.raw=/${pattern}/]`,
        message,
      },
      {
        selector: `CallExpression[callee.name='require'] > TemplateLiteral > TemplateElement[value.raw=/${pattern}/]`,
        message,
      },
    ]
  })

// `forbid` is the single list of layers a file set may not reach. It generates the static import
// patterns AND the dynamic selectors, so the two cannot drift — every earlier round of review
// found a dynamic spelling whose static ban already existed.
const block = (files, { forbid = [], message = '', imports = [], paths = [], forbidPaths = [] } = {}) => ({
  files,
  rules: {
    ...(forbid.length || imports.length || paths.length
      ? {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                ...(forbid.length ? [{ group: forbid.flatMap(layer), message }] : []),
                ...imports,
              ],
              paths,
            },
          ],
        }
      : {}),
    // `forbidPaths` covers subpath rules that `forbid` cannot express at layer granularity —
    // they need their dynamic twins just as much.
    'no-restricted-syntax': ['error', ...ENV_SELECTORS, ...dynamic([...forbid, ...forbidPaths])],
  },
})

const USE_CASE_FORBIDDEN = ['app', 'ui', 'client-cache', 'adapters/inbound', 'adapters/outbound', 'infrastructure']
const USE_CASE_MESSAGE =
  'Outbound adapters are supplied by the composition root. Import `data/**` where the dependency has no port, the port contract where it has one, and `boundary/**` to declare.'
const ENTRIES_ARE_NOT_CALLED = {
  group: ['@/use-cases/*/entries/**', '**/use-cases/*/entries/**'],
  message: 'A declaration never calls another declaration. Compose the operation it wraps.',
}
const USE_CASE_EXTERNALS = {
  group: [...FRAMEWORK, ...DRIVERS, ...NODE_BUILTIN_PATTERNS],
  message: 'Use-cases reach the outside through a data module or a port, never directly.',
}
const INBOUND_FORBIDDEN = ['app', 'ui', 'client-cache']
const OPERATIONS_ARE_NOT_CALLED = {
  group: ['@/use-cases/*/operations/**', '**/use-cases/*/operations/**'],
  message: 'Call the slice\'s entry, not the operation it wraps.',
}

export default [
  // Every file under src/ owes the environment rule, including paths no layer block matches:
  // src/proxy.ts, a migration-era src/lib, any root module. Declared FIRST so the per-layer
  // blocks — which repeat these selectors — override it without losing coverage.
  block(['src/**/*.{ts,tsx}']),

  block(['src/domain/**/*.{ts,tsx}'], {
    forbid: ['app', 'ui', 'client-cache', 'use-cases', 'data', 'ports', 'boundary', 'adapters', 'infrastructure'],
    message:
      'Domain stays pure: schemas and rules only, no project dependencies.',
    imports: [{ group: [...FRAMEWORK, ...DRIVERS, ...NODE_BUILTIN_PATTERNS], message: 'Domain must run in a test, a worker, or a CLI — no framework, driver, or I/O.' }],
    paths: NODE_BUILTIN_PATHS,
  }),

  // A use-case slice has two surfaces with different permissions. The umbrella block covers the
  // whole subtree; the two below REPEAT its rules and add their own, because flat config replaces
  // a rule's options for overlapping files rather than merging them.
  block(['src/use-cases/**/*.{ts,tsx}'], {
    forbid: USE_CASE_FORBIDDEN,
    message: USE_CASE_MESSAGE,
    imports: [USE_CASE_EXTERNALS],
    paths: NODE_BUILTIN_PATHS,
  }),

  block(['src/use-cases/*/operations/**/*.{ts,tsx}'], {
    // No `boundary/**`: an operation that could declare would become a second declaration, and
    // the failure would be normalised and reported twice — once under its name, once under the
    // entry that wraps it.
    forbid: [...USE_CASE_FORBIDDEN, 'boundary'],
    message:
      'An operation throws typed failures and reports nothing. Declaring is the entry\'s job.',
    forbidPaths: ['use-cases/[^\\/]+/entries'],
    imports: [USE_CASE_EXTERNALS, ENTRIES_ARE_NOT_CALLED],
    paths: NODE_BUILTIN_PATHS,
  }),

  block(['src/use-cases/*/entries/**/*.{ts,tsx}'], {
    // No `data/**` or `ports/**`: a declaration that reaches the store directly has skipped the
    // operation it exists to wrap, and the slice loses the surface other slices compose with.
    forbid: [...USE_CASE_FORBIDDEN, 'data', 'ports'],
    message:
      'A declaration wraps an operation. Reaching the store directly skips the surface other slices compose with.',
    imports: [
      USE_CASE_EXTERNALS,
      ENTRIES_ARE_NOT_CALLED,
    ],
    forbidPaths: ['use-cases/[^\\/]+/entries'],
    paths: NODE_BUILTIN_PATHS,
  }),

  block(['src/data/**/*.{ts,tsx}'], {
    forbid: ['app', 'ui', 'client-cache', 'use-cases', 'ports', 'boundary', 'adapters', 'infrastructure'],
    message:
      'Data modules are reached downward. They must not depend on callers.',
    imports: [{ group: FRAMEWORK, message: 'A data module is framework-free so its tests run against the engine.' }],
  }),

  block(['src/adapters/outbound/**/*.{ts,tsx}'], {
    // `boundary` included: an adapter that can declare would validate, normalise and report on its
    // own, and the same failure would be counted twice — once here, once at the entry above it.
    forbid: ['app', 'ui', 'client-cache', 'use-cases', 'data', 'adapters/inbound', 'infrastructure', 'boundary'],
    message:
      'An outbound adapter implements a port contract. It does not declare, and must not import the use-case that owns it, data modules, entry points, UI, or the client cache.',
  }),

  block(['src/adapters/inbound/**/*.{ts,tsx}'], {
    // Browser/service inbound adapters have their own read surface. The server-only read layer is
    // for RSC callers and may reuse generic inbound primitives, never the reverse.
    forbid: [...INBOUND_FORBIDDEN, 'adapters/inbound/read'],
    message:
      'Inbound adapters wire implementations into entries. They do not depend on UI or the server-only RSC read layer.',
    // Entries carry the validation and reporting an inbound adapter depends on. Calling an
    // operation directly skips both.
    imports: [OPERATIONS_ARE_NOT_CALLED],
    forbidPaths: ['use-cases/[^\\/]+/operations'],
  }),

  // This block must follow the inbound parent block. Flat config replaces matching rule options,
  // so the nested read layer gets its own contract rather than inheriting the parent's ban on read.
  block(['src/adapters/inbound/read/**/*.{ts,tsx}'], {
    forbid: INBOUND_FORBIDDEN,
    message:
      'Server-only read adapters may reuse inbound primitives, but do not depend on UI or the browser cache.',
    imports: [OPERATIONS_ARE_NOT_CALLED],
    forbidPaths: ['use-cases/[^\\/]+/operations'],
  }),

  block(['src/client-cache/**/*.{ts,tsx}'], {
    forbid: ['app', 'adapters/outbound', 'data', 'use-cases', 'ports', 'boundary', 'infrastructure', 'ui'],
    message:
      'The client cache calls inbound adapters. Reaching a use-case, data module, or server-only module bundles the server graph — secrets included — into public JavaScript.',
    forbidPaths: ['adapters/inbound/read'],
    imports: [
      {
        group: ['@/adapters/inbound/read/**', '**/adapters/inbound/read/**'],
        message: 'The read layer is server-only.',
      },
      {
        group: [...DRIVERS, ...NODE_BUILTIN_PATTERNS],
        message: 'The client cache runs in the browser; a driver or builtin ships server code to it.',
      },
    ],
    paths: NODE_BUILTIN_PATHS,
  }),

  block(['src/infrastructure/**/*.{ts,tsx}'], {
    forbid: ['app', 'ui', 'client-cache', 'use-cases', 'ports', 'boundary', 'data', 'adapters'],
    message:
      'Infrastructure supports the layers above it and must not import them.',
  }),

  block(['src/ui/**/*.{ts,tsx}'], {
    forbid: ['adapters', 'data', 'use-cases', 'ports', 'boundary', 'infrastructure', 'app'],
    message:
      'Presentation reaches data through the client cache or a read entrypoint, and never imports a route.',
  }),

  block(['src/app/**/*.{ts,tsx}'], {
    forbid: ['adapters/outbound', 'data', 'use-cases', 'ports', 'boundary', 'infrastructure'],
    message:
      'Route entrypoints go through a read entrypoint, an inbound adapter, or the client cache.',
    forbidPaths: ['client-cache/[^\\/]+/queries', 'client-cache/[^\\/]+/mutations'],
    imports: [
      {
        group: [
          '@/client-cache/**/queries',
          '**/client-cache/**/queries',
          '@/client-cache/**/mutations',
          '**/client-cache/**/mutations',
        ],
        message: 'A route may prefetch, but must not import browser hooks.',
      },
    ],
  }),

  block(['src/ports/**/*.{ts,tsx}', 'src/boundary/**/*.{ts,tsx}'], {
    forbid: ['app', 'ui', 'client-cache', 'use-cases', 'data', 'adapters', 'infrastructure', 'ports', 'boundary'],
    message:
      'A contract depends on domain only; anything more makes it a second implementation.',
  }),

  // The validated env module is the one place allowed to read the environment; tests are
  // exempt from the boundary rules so fixtures and doubles can reach across layers.
  {
    files: ['src/infrastructure/env/**/*.{ts,tsx}', '**/__tests__/**/*', '**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-imports': 'off' },
  },
]
