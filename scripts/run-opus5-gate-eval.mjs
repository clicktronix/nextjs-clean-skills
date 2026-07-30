#!/usr/bin/env node
/**
 * Two-arm A/B for the closing verification gate, generated on Claude Opus 5.
 *
 * The frozen `run-architecture-eval.mjs` matrix generates with Codex models and pins four
 * skill-version arms, so it cannot answer whether the gate helps or hurts a Claude model. This
 * runner keeps the same scenarios, rubric, response schema, blind-shuffle algorithm, and Codex
 * judge, and varies only two things: the generator is `claude`, and the arms are the same skill
 * with and without `## Verification Gate`.
 *
 * Arms live in `tests/architecture-evals/opus5-gates/<arm>/` as complete skill directories, so both
 * arms see SKILL.md plus the same references.
 */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const evalRoot = join(root, 'tests', 'architecture-evals')
const armRoot = join(evalRoot, 'opus5-gates')

const model = process.env.OPUS5_EVAL_MODEL ?? 'claude-opus-5'
const effort = process.env.OPUS5_EVAL_EFFORT ?? 'high'
const judgeModel = process.env.OPUS5_EVAL_JUDGE_MODEL ?? 'gpt-5.6-sol'
const framing = process.env.OPUS5_EVAL_FRAMING ?? 'neutral'
const timeoutMs = Number(process.env.OPUS5_EVAL_TIMEOUT_MS ?? 900_000)
const maxBudgetUsd = process.env.OPUS5_EVAL_MAX_BUDGET_USD ?? '6'
const concurrency = Number(process.env.OPUS5_EVAL_CONCURRENCY ?? 4)

const arms = ['with-gates', 'no-gates']
const scenarioIds = ['simple-crud', 'remote-stream', 'cross-capability']
const repeats = [1, 2]

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseArgs(argv) {
  const options = { output: join(evalRoot, 'results', 'opus5-gates-neutral'), scenarios: scenarioIds, resume: false, judgeOnly: false, summaryOnly: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output') options.output = resolve(argv[++index])
    else if (arg === '--scenarios') options.scenarios = argv[++index].split(',')
    else if (arg === '--resume') options.resume = true
    else if (arg === '--judge-only') options.judgeOnly = true
    else if (arg === '--summary-only') options.summaryOnly = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  const unknown = options.scenarios.filter((scenario) => !scenarioIds.includes(scenario))
  if (unknown.length) throw new Error(`Unknown scenarios: ${unknown.join(', ')}`)
  return options
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: options.killGroup ?? false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let forceTimer
    const killChild = (signal) => {
      try {
        if (options.killGroup && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error
      }
    }
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          killChild('SIGTERM')
          forceTimer = setTimeout(() => killChild('SIGKILL'), 5_000)
        }, options.timeoutMs)
      : undefined
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer)
      if (forceTimer) clearTimeout(forceTimer)
      if (timedOut) return reject(new Error(`${command} timed out after ${options.timeoutMs}ms`))
      if (code === 0) return resolvePromise({ stdout, stderr })
      reject(new Error(`${command} exited ${code ?? `from ${signal}`}\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    })
    child.stdin.end(options.input ?? '')
  })
}

async function pool(items, limit, worker) {
  const queue = [...items.entries()]
  const results = new Array(items.length)
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      const [index, item] = next
      results[index] = await worker(item)
    }
  })
  await Promise.all(runners)
  return results
}

async function readScenario(scenarioId) {
  return JSON.parse(await readFile(join(evalRoot, 'scenarios', `${scenarioId}.json`), 'utf8'))
}

function scenarioPrompt(scenario) {
  return [scenario.task, scenario.framings?.[framing] ? `Stakeholder framing: ${scenario.framings[framing]}` : '']
    .filter(Boolean)
    .join('\n\n')
}

async function hashArm(arm) {
  const dir = join(armRoot, arm)
  const files = []
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) await walk(absolute)
      else files.push(absolute)
    }
  }
  await walk(dir)
  files.sort()
  const hash = createHash('sha256')
  for (const file of files) hash.update(await readFile(file))
  return { dirHash: hash.digest('hex'), skillHash: sha256(await readFile(join(dir, 'SKILL.md'))) }
}

async function generateCell({ scenarioId, repeat, arm, outputRoot, resume }) {
  const runDir = join(outputRoot, 'runs', scenarioId, `repeat-${repeat}`, arm)
  const responsePath = join(runDir, 'response.json')
  if (resume && existsSync(responsePath)) {
    process.stdout.write(`skip generation ${scenarioId} repeat=${repeat} arm=${arm}\n`)
    return
  }
  const scenario = await readScenario(scenarioId)
  const workspace = await mkdtemp(join(tmpdir(), `opus5-gate-${scenarioId}-${arm}-`))
  await mkdir(runDir, { recursive: true })
  const task = scenarioPrompt(scenario)
  await writeFile(join(workspace, 'TASK.md'), `# ${scenario.title}\n\n${task}\n`)
  await cp(join(armRoot, arm), join(workspace, 'skill'), { recursive: true })

  const prompt = [
    'Work only from the hypothetical task in ./TASK.md.',
    'Do not inspect parent directories, the user\'s home directory, or unrelated repositories.',
    'An architecture skill is available at ./skill/SKILL.md. Read it before answering. ' +
      'Read only the linked references that are directly relevant to this task.',
    'Return an architecture proposal only. Do not edit files.',
    'Use concrete paths and call flows. Keep the answer concise but complete.',
  ].join('\n')
  await writeFile(join(runDir, 'prompt.txt'), prompt)

  // Same response contract as the frozen runner, minus `$schema`: the CLI's validator rejects the
  // 2020-12 meta-schema reference, and the constraints themselves are what the arms are held to.
  const schema = await readFile(join(evalRoot, 'response.schema.json'), 'utf8')
  const { $schema: _ignored, ...schemaBody } = JSON.parse(schema)
  const cliSchema = JSON.stringify(schemaBody)
  const { dirHash, skillHash } = await hashArm(arm)
  await writeFile(
    join(runDir, 'metadata.json'),
    `${JSON.stringify({ scenario: scenarioId, arm, repeat, model, effort, framing, taskHash: sha256(task), skillHash, armDirHash: dirHash, responseSchemaHash: sha256(schema) }, null, 2)}\n`,
  )

  // One retry: a transient CLI/API failure in cell 3 of 12 should not discard the other cells.
  const attempt = async () => {
    const { stdout } = await run(
      'claude',
      [
        '-p',
        prompt,
        '--model',
        model,
        '--effort',
        effort,
        '--output-format',
        'json',
        '--json-schema',
        cliSchema,
        '--setting-sources',
        '',
        '--strict-mcp-config',
        '--allowedTools',
        'Read',
        'Glob',
        'Grep',
        '--max-budget-usd',
        maxBudgetUsd,
      ],
      { cwd: workspace, env: process.env, timeoutMs, killGroup: true },
    )
    const result = JSON.parse(stdout)
    await writeFile(join(runDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
    if (result.is_error || !result.structured_output) {
      throw new Error(`claude returned no structured output for ${scenarioId}/${arm}: ${result.result ?? result.subtype}`)
    }
    await writeFile(responsePath, `${JSON.stringify(result.structured_output, null, 2)}\n`)
    await writeFile(
      join(runDir, 'usage.json'),
      `${JSON.stringify(
        {
          outputTokens: result.usage?.output_tokens ?? 0,
          inputTokens: result.usage?.input_tokens ?? 0,
          cacheReadInputTokens: result.usage?.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens: result.usage?.cache_creation_input_tokens ?? 0,
          numTurns: result.num_turns ?? 0,
          durationMs: result.duration_ms ?? 0,
          costUsd: result.total_cost_usd ?? 0,
        },
        null,
        2,
      )}\n`,
    )
  }

  try {
    process.stdout.write(`generate ${scenarioId} repeat=${repeat} arm=${arm}\n`)
    try {
      await attempt()
    } catch (error) {
      process.stdout.write(`retry ${scenarioId} repeat=${repeat} arm=${arm}: ${error.message.split('\n')[0]}\n`)
      await attempt()
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

function shuffledCandidates(scenarioId, repeat) {
  return arms
    .map((arm) => ({ arm, key: sha256(`${scenarioId}:${repeat}:${arm}`).slice(0, 12) }))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((item, index) => ({ ...item, candidate: `candidate-${index + 1}` }))
}

async function prepareCodexHome(base) {
  const codexHome = join(base, 'codex-home')
  await mkdir(codexHome, { recursive: true })
  await symlink(await realpath(join(homedir(), '.codex', 'auth.json')), join(codexHome, 'auth.json'))
  return codexHome
}

async function judgeGroup({ scenarioId, repeat, outputRoot, codexHome, resume }) {
  const judgeDir = join(outputRoot, 'judges', scenarioId, `repeat-${repeat}`)
  const scorePath = join(judgeDir, 'scores.blind.json')
  if (resume && existsSync(scorePath)) {
    process.stdout.write(`skip judge ${scenarioId} repeat=${repeat}\n`)
    return
  }
  const scenario = await readScenario(scenarioId)
  const mapping = shuffledCandidates(scenarioId, repeat)
  const candidates = []
  for (const item of mapping) {
    const response = JSON.parse(
      await readFile(join(outputRoot, 'runs', scenarioId, `repeat-${repeat}`, item.arm, 'response.json'), 'utf8'),
    )
    candidates.push({ candidate: item.candidate, response })
  }
  await mkdir(judgeDir, { recursive: true })
  const input = {
    task: scenarioPrompt(scenario),
    rubric: scenario.rubric,
    scoring:
      'Score each positive item 0 missing/wrong, 1 partial, 2 clear/coherent. ' +
      'Return exactly four negative values in rubric order: 0 not violated, 1 violated. ' +
      'total = sum(positive) - sum(negative). ' +
      'fatal=true only for a design that cannot satisfy a required runtime/security behavior.',
    candidates,
  }
  await writeFile(join(judgeDir, 'input.json'), `${JSON.stringify(input, null, 2)}\n`)
  await writeFile(join(judgeDir, 'mapping.json'), `${JSON.stringify(mapping, null, 2)}\n`)

  const workspace = await mkdtemp(join(tmpdir(), `opus5-gate-judge-${scenarioId}-`))
  await writeFile(join(workspace, 'JUDGE_INPUT.json'), `${JSON.stringify(input, null, 2)}\n`)
  const prompt = [
    'Blindly evaluate the two architecture proposals in ./JUDGE_INPUT.json.',
    'Judge only against the supplied task and preregistered rubric.',
    'Do not infer which skill or architecture produced a candidate.',
    'Use the candidate identifiers exactly. Check arithmetic before returning JSON.',
  ].join('\n')
  try {
    process.stdout.write(`judge ${scenarioId} repeat=${repeat}\n`)
    const { stdout } = await run(
      'codex',
      [
        'exec',
        '--ignore-user-config',
        '--ignore-rules',
        '--skip-git-repo-check',
        '--ephemeral',
        '--sandbox',
        'read-only',
        '--model',
        judgeModel,
        '--output-schema',
        join(armRoot, 'judge.schema.json'),
        '--output-last-message',
        scorePath,
        '--json',
        '-C',
        workspace,
        '-',
      ],
      { cwd: workspace, env: { ...process.env, CODEX_HOME: codexHome }, input: prompt, timeoutMs, killGroup: true },
    )
    await writeFile(join(judgeDir, 'events.jsonl'), stdout)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

async function writeSummary(outputRoot, selectedScenarios) {
  const rows = []
  for (const scenarioId of selectedScenarios) {
    for (const repeat of repeats) {
      const judgeDir = join(outputRoot, 'judges', scenarioId, `repeat-${repeat}`)
      const mapping = JSON.parse(await readFile(join(judgeDir, 'mapping.json'), 'utf8'))
      const scores = JSON.parse(await readFile(join(judgeDir, 'scores.blind.json'), 'utf8'))
      const armByCandidate = new Map(mapping.map((item) => [item.candidate, item.arm]))
      for (const score of scores.candidates) {
        const arm = armByCandidate.get(score.candidate)
        const calculatedTotal =
          score.positive.reduce((sum, value) => sum + value, 0) - score.negative.reduce((sum, value) => sum + value, 0)
        const usage = JSON.parse(
          await readFile(join(outputRoot, 'runs', scenarioId, `repeat-${repeat}`, arm, 'usage.json'), 'utf8'),
        )
        rows.push({
          scenario: scenarioId,
          repeat,
          arm,
          positive: score.positive,
          negative: score.negative,
          total: calculatedTotal,
          reportedTotal: score.total,
          arithmeticMatches: calculatedTotal === score.total,
          fatal: score.fatal,
          explanation: score.explanation,
          usage,
        })
      }
    }
  }
  const aggregate = arms.map((arm) => {
    const armRows = rows.filter((row) => row.arm === arm)
    const total = armRows.reduce((sum, row) => sum + row.total, 0)
    const sum = (key) => armRows.reduce((accumulator, row) => accumulator + (row.usage?.[key] ?? 0), 0)
    return {
      arm,
      cells: armRows.length,
      total,
      mean: Number((total / armRows.length).toFixed(3)),
      fatalCount: armRows.filter((row) => row.fatal).length,
      outputTokens: sum('outputTokens'),
      meanOutputTokens: Math.round(sum('outputTokens') / armRows.length),
      numTurns: sum('numTurns'),
      costUsd: Number(sum('costUsd').toFixed(4)),
    }
  })
  await writeFile(join(outputRoot, 'summary.json'), `${JSON.stringify({ aggregate, rows }, null, 2)}\n`)
  process.stdout.write(
    `${aggregate.map((item) => `${item.arm}: mean=${item.mean} fatal=${item.fatalCount} out_tokens=${item.meanOutputTokens} turns=${item.numTurns}`).join('\n')}\n`,
  )
}

async function writeManifest(outputRoot, options) {
  const { stdout: head } = await run('git', ['rev-parse', 'HEAD'], { cwd: root })
  const { stdout: claudeVersion } = await run('claude', ['--version'], { cwd: root })
  const { stdout: codexVersion } = await run('codex', ['--version'], { cwd: root })
  const armHashes = {}
  for (const arm of arms) armHashes[arm] = await hashArm(arm)
  await mkdir(outputRoot, { recursive: true })
  await writeFile(
    join(outputRoot, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        experiment: 'verification-gate-removal',
        repositoryHead: head.trim(),
        generator: 'claude',
        generationModel: model,
        effort,
        judgeModel,
        judgeRunner: 'codex',
        claudeVersion: claudeVersion.trim(),
        codexVersion: codexVersion.trim(),
        framing,
        arms,
        armHashes,
        scenarios: options.scenarios,
        repeats: repeats.length,
        generationRuns: options.scenarios.length * repeats.length * arms.length,
        blindJudgeRuns: options.scenarios.length * repeats.length,
      },
      null,
      2,
    )}\n`,
  )
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  await mkdir(options.output, { recursive: true })
  if (options.summaryOnly) return writeSummary(options.output, options.scenarios)

  const tempBase = await mkdtemp(join(tmpdir(), 'opus5-gate-home-'))
  const codexHome = await prepareCodexHome(tempBase)
  try {
    if (!options.judgeOnly) {
      if (!options.resume || !existsSync(join(options.output, 'manifest.json'))) {
        await writeManifest(options.output, options)
      }
      const cells = options.scenarios.flatMap((scenarioId) =>
        repeats.flatMap((repeat) => arms.map((arm) => ({ scenarioId, repeat, arm }))),
      )
      await pool(cells, concurrency, (cell) =>
        generateCell({ ...cell, outputRoot: options.output, resume: options.resume }),
      )
    }
    for (const scenarioId of options.scenarios) {
      for (const repeat of repeats) {
        await judgeGroup({ scenarioId, repeat, outputRoot: options.output, codexHome, resume: options.resume })
      }
    }
    await writeSummary(options.output, options.scenarios)
  } finally {
    await rm(tempBase, { recursive: true, force: true })
  }
}

await main()
