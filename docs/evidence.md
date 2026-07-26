# Evidence

What the 2.0.0 rules are based on, and how much of each claim is measured.

Not every rule here came from a count. Some are measured, some are derived from canonical sources,
and some are judgement recorded so it can be argued with. Each rule below says which it is. A rule
with no entry in this file is judgement — treat it accordingly.

## Sources

**Canonical.** Alistair Cockburn, *Hexagonal Architecture (Ports and Adapters)* — the definition of
a port as a purposeful conversation with something outside the process, and the placement of a
database outside the hexagon. Alex Bespoyasov, *Чистая архитектура на фронтенде* (bespoyasov.ru) —
the three-layer split, the dependency rule, input/output ports, the impure-sandwich shape, and the
explicit allowance for supplying dependencies through closures instead of a container.

**Corrected 2026-07-26.** Two claims in this file previously leaned on those sources and did not
survive a re-read of them. Cockburn presents an in-memory mock as a legitimate adapter — "most
importantly, an adapter to a 'mock' database" — so there is no canonical warning against
mock-backed ports to cite; and he calls the port count "a matter of intuition" with "no particular
damage in choosing the 'wrong' number", so "two to four" was never a rule. Bespoyasov presents the
impure sandwich as a way to structure code, and gives no criterion for when a use-case should
exist. What replaced them is stated as ours: see the judgement section.

**What the field measurements do and do not establish.** They establish that the 1.3.1 guidance
produced forwarding functions and bypassed layers in the products built on it. They do **not**
establish that the replacement criterion is right — a count of past damage cannot validate a new
rule. Treat the port criterion, the deletion test as gate, and the single boundary declaration as
judgement with a measured motive.

**Field.** Two production Next.js applications owned by this repository's author —
`marqa/platform` (store-backed: Postgres with stored functions and row-level policies) and
`stokli/frontend` (service-backed: an owned HTTP service with SSE) — plus
`clicktronix/fullstack-ai-template`, the reference template seeded from them. An internal
architecture handbook from a multi-product transportation platform contributed the document shape
and several defects listed at the end; it is not named because it is a third party's document.

Measurements were taken 2026-07-25. Commands below are run from each repository root.

## Measured

### The application layer is thin

Counting only exported functions in `src/use-cases`, excluding tests, `ports.ts`, and `types.ts` —
one population for numerator and denominator:

```python
# python3 - <<'PY'  (run from the product repo root)
import re, subprocess, pathlib
files = subprocess.run(['find','src/use-cases','-name','*.ts','-not','-path','*__tests__*',
  '-not','-name','*.test.ts','-not','-name','ports.ts','-not','-name','types.ts'],
  capture_output=True, text=True).stdout.split()
tot = fwd = thin = sub = 0
for f in files:
    for m in re.finditer(r'^export (?:async )?function \w+\([\s\S]*?^\}', pathlib.Path(f).read_text(), re.M):
        tot += 1; lines = [l for l in m.group(0).split('\n')[1:-1] if l.strip()]
        if len(lines) == 1 and re.match(r'\s*return (await )?deps\.', lines[0]): fwd += 1
        if len(lines) <= 2: thin += 1
        if len(lines) > 6: sub += 1
print(tot, fwd, thin, sub)
```

`marqa/platform`: **201** functions — **62 (31%)** forward to a port with no other statement,
**104 (52%)** have two lines of body or fewer, **44 (22%)** have more than six.

`fullstack-ai-template`: **11** functions, **4** pure forwards; most of the rest are parse-then-forward.

An earlier draft of this file claimed 81%. That figure came from `grep "^  return deps\."`, which
counts a matching *line* anywhere in a body — so any function that validated and then returned was
miscounted as a forward. The corrected measure is above. **This supports
`use-cases/when-a-use-case-exists.md` and `use-cases/use-case-wrapper.md`** — half the layer carries
two lines or fewer — but it does not support the stronger claim that the layer is almost entirely
empty.

### Cross-cutting work is repeated by hand

```bash
# Standalone, from the product root. POSIX only — no `grep -P`, and `-print0 | xargs -0`
# instead of a shell variable, which overflows the argument limit on this file set.
# The leading character class matters: a bare `parse(` also matches `safeParse(`/`JSON.parse(`.
FIND="find src/use-cases -name *.ts -not -path *__tests__* -not -name *.test.ts \
  -not -name ports.ts -not -name types.ts -print0"
$FIND | xargs -0 grep -ohE 'assertValidUuid(OrNull)?\(' | wc -l        # 66
$FIND | xargs -0 grep -ohE '(^|[^.[:alnum:]_])parse\(' | wc -l        # 44
```

`marqa/platform`: **66** identifier assertions and **44** schema parses, written per function —
**110** call sites doing what one wrapper would do once. The lookbehind matters: a bare `parse(`
grep also matches `safeParse(` and `JSON.parse(`.

```bash
find src/use-cases -name '*.ts' | wc -l          # 2
```

`stokli/frontend` has **2** files in `src/use-cases`, and each hand-writes the same sequence —
validate, log, call, catch, return a typed failure. **Supports `use-cases/use-case-wrapper.md`.**

### Rules survive where lint enforces them

```bash
# -l lists FILES; the prose below counts files, so the command must too.
grep -rl "from '@/adapters/" src/use-cases --include='*.ts' | grep -v '\.test\.' | wc -l
grep -rl "from '@/adapters/outbound/api" src/ui --include='*.ts' --include='*.tsx' | wc -l
```

`marqa/platform`: **0** application files import a concrete adapter — it enforces path-scoped import
restrictions plus an allowlist requiring written justification. `stokli/frontend`: **both**
`src/use-cases` files import one directly, and **68** UI files import an outbound adapter. It has no
such rules. **Supports `placement/layers-and-imports.md` and the repo's stance that a convention
without an executable check does not hold.**

### The client cache had to be carved out of its parent

```bash
# marqa/platform — unique files in the allowlist the ui/** block carves out.
# Count unique paths: each appears twice, once per allowlist block.
grep -oE "src/ui/server-state/[A-Za-z0-9/._-]+\.tsx?" eslint.config.mjs | sort -u | wc -l   # 11
```

In both `fullstack-ai-template/eslint.config.mjs` and `marqa/platform/eslint.config.mjs`, the
`ui/**` rule block excludes `ui/server-state/**`; marqa then re-applies a subset to an allowlist of
**11** files (auth events, realtime, SSE transport). **Supports promoting it to a top-level
`client-cache/` layer** — those eleven are the layer's normal business, not exceptions.

### Modules with no caller in the template

```bash
# the modules exist…
find src/adapters/outbound/transport -type f
# …and nothing imports them. Match import/require lines only, excluding the module's own tree
# and comments — a bare grep also counts the prose that mentions the path.
grep -rnE "^\s*(import|const .*=\s*require)\b.*outbound/transport" src e2e tests \
  | grep -v "^src/adapters/outbound/transport"
grep -rnE "^\s*import\b.*escapeLikePattern" src | grep -v __tests__
grep -rnE "^\s*import\b.*withServerReadErrorHandling" src
```

Three modules — the outbound transport, the pattern escaper, and the server-read error wrapper —
have zero production call sites. Two escaping functions exist with different behaviour; find both and compare their character sets:

```bash
grep -rnE "function escape[A-Za-z]*\(" src --include='*.ts'          # both definitions
grep -rA4 -E "function escape[A-Za-z]*\(" src --include='*.ts' \
  | grep -E "replaceAll|replace\("                                    # their character sets
```

The tested one omits the character that breaks filter syntax, the live one omits the character
that breaks the pattern. **Supports
`quality/testing-by-layer.md` and the single-escaper rule in `outbound/supabase-rls.md`.**

### The second backend was built twice and modelled nowhere

```bash
# both transports
ls src/adapters/outbound/transport/          # in marqa/platform and stokli/frontend
# the keyed, non-evicting refresh, and the template's unkeyed copy
grep -rn "class RefreshManager\|createRefreshManager" src --include='*.ts'
```

`marqa/platform` and `stokli/frontend` each ship a transport for an owned service — stream proxy,
SSE client, keyed refresh, backend error mapping — and 1.3.1 had no rule for any of it. `stokli`'s
refresh manager keys by identity and never evicts an in-flight entry; the template's copy does
neither. **Supports `outbound/service-transport.md` and `inbound/streaming.md`.**

### What each enforcement tier can and cannot see

Three measurements taken with a throwaway fixture project (a `src/` tree, a tsconfig mapping
`@/*` → `./src/*`, and the two configs from `rules/`), plus one against a real product. Each is a
claim about tooling behaviour, so each is reproducible without our repos.

```bash
# 1. With the node resolver alone — no alias resolver — does a forbidden ALIASED import error?
#    Zone: target ./src/use-cases, from ./src/adapters/outbound.
#    Write both spellings of the same edge and lint them.
printf "import { h } from '@/adapters/outbound/agent/http'\nexport default h\n" > src/use-cases/alias.ts
printf "import { h } from '../adapters/outbound/agent/http'\nexport default h\n" > src/use-cases/rel.ts
npx eslint src/use-cases --format json   # settings: { 'import/resolver': { node: {...} } }

# 2. Does gitignore-style negation exempt a path inside a no-restricted-imports group?
#    group: ['@/client-cache/**', '!@/client-cache/*/prefetch'] — and two variants.
npx eslint src/app --format json

# 3. Does the canary rule fire on a project's real asset imports?
#    From a Next.js product root, with import/no-unresolved: error and both resolvers.
grep -rlE "from '[^']+\.(css|json)'|import '[^']+\.css'" src | head -40 | tr '\n' '\0' \
  | xargs -0 npx eslint --no-config-lookup --config /tmp/probe.config.mjs --format json
```

1. **The aliased import lints clean; only the relative one errors.** `no-restricted-paths` compares
   resolved paths, so an unresolvable specifier is skipped rather than reported — a resolver that is
   installed but not configured produces a boundary that passes everything and says nothing. This is
   why the resolved tier declares `import/no-unresolved` alongside its zones, and why the validator
   re-runs the same fixture with the resolver stripped and requires an error.
2. **The negation does not exempt** — the `prefetch` import is still rejected, in all three
   spellings tried. String matching therefore cannot express "this layer except one entry", which is
   the capability the resolved tier is carried for.
3. **Zero errors across 40 files** importing CSS modules, package CSS, and `.json`. The node and
   TypeScript resolvers cover those between them, so the canary is adoptable rather than a rule a
   project immediately switches off. **Supports the two-tier split in `rules/README.md` and the
   resolver caveat in `placement/layers-and-imports.md`.**

## Derived from canonical sources, not counted

- **`seams/dependency-categories.md`** — only the port definition and the database's position
  outside the hexagon are Cockburn's. **When a port is required is ours**, and the reference now says
  so in the file: externality does not earn a port, a capability the core must state
  technology-independently does. The mock-as-indirection argument is ours too, and rests on the
  measured suite that passed over a broken filter.
- **`use-cases/when-a-use-case-exists.md`** — the impure-sandwich *shape* is Bespoyasov's. Using it
  as a **gate** was ours and is now demoted to a heuristic; the gate is the deletion test.
- **`use-cases/use-case-wrapper.md`** — a single application boundary is our judgement, motivated by
  the 110 hand-written validation sites. The declaration/internal-operation split replaced a public
  `.run` accessor that let callers reach past the guarantees it declared.
- **`seams/composition-without-di.md`** — Bespoyasov supplies dependencies through closures rather
  than a container. The numeric thresholds for revisiting that decision (five collaborators, three
  assembly sites) are **judgement**, not measurement: they exist so the choice can be reopened on a
  stated trigger rather than on taste.

## Judgement, recorded so it can be argued with

`seams/port-shape.md`, `errors/error-taxonomy.md`, `errors/failure-at-the-boundary.md`,
`placement/slices-and-ownership.md`, `caching/cache-tiers.md`, `inbound/route-handlers.md`.

The one worth flagging: **the failure-carrier choice**. What is measured is that the template runs
three inbound wrappers with different guarantees — one per channel — and that `stokli` hand-wrote
the same result-shaped contract twice.

```bash
# fullstack-ai-template: one wrapper per channel, each with its own guarantees
grep -rlE "export (const|function) (withRouteErrorHandling|withServerReadErrorHandling|adminActionClient|authActionClient)" \
  src/infrastructure --include='*.ts' | sort
# -> actions/safe-action.ts, api/with-route-error-handling.ts, errors/with-server-read-error-handling.ts
```

(A looser grep for `with[A-Z]` also matches `with-auth` and `action-error`, which are different
concerns — hence the explicit name list.) That supports *one classification owned by one boundary*. It does not
by itself select a returned value over a thrown typed error; that part is a recommendation, argued
in the reference from the serialization constraint at the server/client boundary.

## Defects found in the upstream handbook

Recorded so the same shapes are not reintroduced: input validation skipped for falsy inputs;
telemetry retaining raw input values, all headers, and all cookies; an off-by-one in a polling
helper (`maxAttempts: N` performs N−1 calls); a response envelope type whose success arm is
unreachable; a mandatory one-to-one re-export of every port type; and boundary lint installed but
disabled in the product it governs.

---

*Last reviewed against the live skill set: 2026-07-26 (skill version 2.0.0). When a skill rule
or template pattern changes, refresh this document in the same PR.*
