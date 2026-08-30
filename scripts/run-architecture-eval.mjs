import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { hashDirectory } from "./hash-directory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evalRoot = join(root, "tests", "architecture-evals");
const defaultOutput = join(evalRoot, "results", "smoke-2026-07-27");
const model = process.env.ARCH_EVAL_MODEL ?? "gpt-5.6-luna";
const judgeModel = process.env.ARCH_EVAL_JUDGE_MODEL ?? "gpt-5.6-sol";
const framing = process.env.ARCH_EVAL_FRAMING ?? "neutral";
const timeoutMs = Number(process.env.ARCH_EVAL_TIMEOUT_MS ?? 300_000);
const releaseArms = ["no-skill", "v1.3.2", "layer-first", "capability-first"];
const ownershipArms = ["no-skill", "v1.3.2", "pre-domain-order", "capability-first"];
const scenarioIds = ["simple-crud", "remote-stream", "cross-capability"];
const knownScenarioIds = [...scenarioIds, "ownership-resolution"];

function armsForScenario(scenarioId) {
  return scenarioId === "ownership-resolution" ? ownershipArms : releaseArms;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv) {
  const options = {
    output: defaultOutput,
    repeat: 1,
    smoke: false,
    judgeOnly: false,
    summaryOnly: false,
    resume: false,
    candidateOnly: false,
    scenarios: scenarioIds,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--smoke") options.smoke = true;
    else if (arg === "--judge-only") options.judgeOnly = true;
    else if (arg === "--summary-only") options.summaryOnly = true;
    else if (arg === "--resume") options.resume = true;
    else if (arg === "--candidate-only") options.candidateOnly = true;
    else if (arg === "--control-source") options.controlSource = resolve(argv[++index]);
    else if (arg === "--scenario") options.scenario = argv[++index];
    else if (arg === "--scenarios") options.scenarios = argv[++index].split(",");
    else if (arg === "--arm") options.arm = argv[++index];
    else if (arg === "--repeat") options.repeat = Number(argv[++index]);
    else if (arg === "--output") options.output = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (
    !options.smoke &&
    !options.judgeOnly &&
    !options.summaryOnly &&
    (!knownScenarioIds.includes(options.scenario) || !armsForScenario(options.scenario).includes(options.arm))
  ) {
    throw new Error("Single run requires a known --scenario and --arm.");
  }
  if (options.judgeOnly && !knownScenarioIds.includes(options.scenario)) {
    throw new Error("--judge-only requires a known --scenario.");
  }
  if (options.scenarios.some((scenario) => !knownScenarioIds.includes(scenario))) {
    throw new Error("--scenarios contains an unknown scenario.");
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1) {
    throw new Error("--repeat must be a positive integer.");
  }
  if (options.candidateOnly && (!options.smoke || !options.controlSource)) {
    throw new Error("--candidate-only requires --smoke and --control-source.");
  }
  if (options.candidateOnly && options.scenarios.some((scenario) => scenario === "ownership-resolution")) {
    throw new Error("--candidate-only cannot reuse controls for ownership-resolution.");
  }
  return options;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: options.killGroup ?? false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceTimer;
    const killChild = (signal) => {
      try {
        if (options.killGroup && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    };
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killChild("SIGTERM");
          forceTimer = setTimeout(() => killChild("SIGKILL"), 5_000);
        }, options.timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      if (timedOut) {
        reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
        return;
      }
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${command} exited ${code ?? `from ${signal}`}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    });
    child.stdin.end(options.input ?? "");
  });
}

async function gitShow(spec) {
  const { stdout } = await run("git", ["show", spec], { cwd: root });
  return stdout;
}

async function gitArchive(commit, skillDir, target) {
  await mkdir(target, { recursive: true });
  const archive = spawn(
    "git",
    ["archive", commit, skillDir],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  const archiveExited = new Promise((resolvePromise, reject) => {
    archive.once("error", reject);
    archive.once("exit", resolvePromise);
  });
  const extract = spawn(
    "tar",
    ["-x", "-C", target, "--strip-components=4"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const extractExited = new Promise((resolvePromise, reject) => {
    extract.once("error", reject);
    extract.once("exit", resolvePromise);
  });
  archive.stdout.pipe(extract.stdin);
  let archiveError = "";
  let extractError = "";
  archive.stderr.on("data", (chunk) => {
    archiveError += chunk;
  });
  extract.stderr.on("data", (chunk) => {
    extractError += chunk;
  });
  const [archiveCode, extractCode] = await Promise.all([
    archiveExited,
    extractExited,
  ]);
  if (archiveCode !== 0 || extractCode !== 0) {
    throw new Error(`git archive failed (${archiveCode}/${extractCode})\n${archiveError}${extractError}`);
  }
}

async function prepareCodexHome(base) {
  const codexHome = join(base, "codex-home");
  await mkdir(codexHome, { recursive: true });
  const sourceAuth = join(homedir(), ".codex", "auth.json");
  await symlink(await realpath(sourceAuth), join(codexHome, "auth.json"));
  return codexHome;
}

// The control arms archive `skills/nextjs-architecture` from a tag and a commit that both predate
// the renames that produced today's `designing-architecture`. These paths are historical and must not be renamed
// with the working tree, or `git archive` finds nothing and the control arms silently ship an empty
// skill directory. A new arm cut from HEAD needs the current name instead.
async function prepareArm(arm, workspace) {
  if (arm === "no-skill") return { instruction: "", skillHash: null, skillTreeHash: null };

  const skillTarget = join(workspace, "skill");
  if (arm === "v1.3.2") {
    await gitArchive(
      "v1.3.2",
      "plugins/nextjs-clean-skills/skills/nextjs-architecture",
      skillTarget,
    );
  } else if (arm === "layer-first") {
    await gitArchive(
      "626140b5d68e5b3afcfc80e209df5d881f35d59c",
      "plugins/nextjs-clean-skills/skills/nextjs-architecture",
      skillTarget,
    );
  } else if (arm === "pre-domain-order") {
    await gitArchive(
      "ad4ed112950f7c135cb0255f5d8f427d467d401a",
      "plugins/nextjs-clean-skills/skills/designing-architecture",
      skillTarget,
    );
  } else {
    await cp(join(evalRoot, "candidate"), skillTarget, { recursive: true });
  }

  const skill = await readFile(join(skillTarget, "SKILL.md"), "utf8");
  return {
    instruction:
      "An architecture skill is available at ./skill/SKILL.md. Read it before answering. " +
      "Read only the linked references that are directly relevant to this task.",
    skillHash: sha256(skill),
    skillTreeHash: await hashDirectory(skillTarget),
  };
}

async function executeCodex({ cwd, codexHome, prompt, schema, output, events, selectedModel }) {
  const args = [
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--model",
    selectedModel,
    "--output-schema",
    schema,
    "--output-last-message",
    output,
    "--json",
    "-C",
    cwd,
    "-",
  ];
  const result = await run("codex", args, {
    cwd,
    env: { ...process.env, CODEX_HOME: codexHome },
    input: prompt,
    timeoutMs,
    killGroup: true,
  });
  await writeFile(events, result.stdout);
  if (result.stderr) await writeFile(`${events}.stderr`, result.stderr);
}

async function runCell({ scenarioId, arm, repeat, outputRoot, codexHome, resume = false }) {
  const scenario = JSON.parse(
    await readFile(join(evalRoot, "scenarios", `${scenarioId}.json`), "utf8"),
  );
  const runDir = join(outputRoot, "runs", scenarioId, `repeat-${repeat}`, arm);
  const responsePath = join(runDir, "response.json");
  const eventsPath = join(runDir, "events.jsonl");
  if (
    resume &&
    (await fileExists(responsePath)) &&
    (await fileExists(eventsPath))
  ) {
    process.stdout.write(`skip generation ${scenarioId} repeat=${repeat} arm=${arm}\n`);
    return;
  }
  const workspace = await mkdtemp(join(tmpdir(), `nextjs-arch-${scenarioId}-${arm}-`));
  await mkdir(runDir, { recursive: true });
  const armInfo = await prepareArm(arm, workspace);
  const scenarioTask = [
    scenario.task,
    scenario.framings?.[framing] ? `Stakeholder framing: ${scenario.framings[framing]}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const taskPath = join(workspace, "TASK.md");
  await writeFile(taskPath, `# ${scenario.title}\n\n${scenarioTask}\n`);
  const prompt = [
    "Work only from the hypothetical task in ./TASK.md.",
    "Do not inspect parent directories, the user's home directory, or unrelated repositories.",
    armInfo.instruction,
    "Return an architecture proposal only. Do not edit files.",
    "Use concrete paths and call flows. Keep the answer concise but complete.",
  ]
    .filter(Boolean)
    .join("\n");
  await writeFile(join(runDir, "prompt.txt"), prompt);
  await writeFile(
    join(runDir, "metadata.json"),
    `${JSON.stringify(
      {
        scenario: scenarioId,
        arm,
        repeat,
        model,
        framing,
        taskHash: sha256(scenarioTask),
        skillHash: armInfo.skillHash,
        skillTreeHash: armInfo.skillTreeHash,
        responseSchemaHash: sha256(await readFile(join(evalRoot, "response.schema.json"))),
      },
      null,
      2,
    )}\n`,
  );
  try {
    process.stdout.write(`generate ${scenarioId} repeat=${repeat} arm=${arm}\n`);
    await executeCodex({
      cwd: workspace,
      codexHome,
      prompt,
      schema: join(evalRoot, "response.schema.json"),
      output: responsePath,
      events: eventsPath,
      selectedModel: model,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function shuffledCandidates(scenarioId, repeat) {
  return armsForScenario(scenarioId)
    .map((arm) => ({ arm, key: sha256(`${scenarioId}:${repeat}:${arm}`).slice(0, 12) }))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((item, index) => ({ ...item, candidate: `candidate-${index + 1}` }));
}

async function judgeGroup({ scenarioId, repeat, outputRoot, codexHome, resume = false }) {
  const scenario = JSON.parse(
    await readFile(join(evalRoot, "scenarios", `${scenarioId}.json`), "utf8"),
  );
  const mapping = shuffledCandidates(scenarioId, repeat);
  const candidates = [];
  for (const item of mapping) {
    const response = JSON.parse(
      await readFile(
        join(outputRoot, "runs", scenarioId, `repeat-${repeat}`, item.arm, "response.json"),
        "utf8",
      ),
    );
    candidates.push({ candidate: item.candidate, response });
  }
  const judgeDir = join(outputRoot, "judges", scenarioId, `repeat-${repeat}`);
  const scorePath = join(judgeDir, "scores.blind.json");
  const eventsPath = join(judgeDir, "events.jsonl");
  if (
    resume &&
    (await fileExists(scorePath)) &&
    (await fileExists(eventsPath))
  ) {
    process.stdout.write(`skip judge ${scenarioId} repeat=${repeat}\n`);
    return;
  }
  const workspace = await mkdtemp(join(tmpdir(), `nextjs-arch-judge-${scenarioId}-`));
  await mkdir(judgeDir, { recursive: true });
  const scenarioTask = [
    scenario.task,
    scenario.framings?.[framing] ? `Stakeholder framing: ${scenario.framings[framing]}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const input = {
    task: scenarioTask,
    rubric: scenario.rubric,
    scoring:
      "Score each positive item 0 missing/wrong, 1 partial, 2 clear/coherent. " +
      "Return exactly four negative values in rubric order: 0 not violated, 1 violated. " +
      "total = sum(positive) - sum(negative). " +
      "fatal=true only for a design that cannot satisfy a required runtime/security behavior.",
    candidates,
  };
  await writeFile(join(workspace, "JUDGE_INPUT.json"), `${JSON.stringify(input, null, 2)}\n`);
  const prompt = [
    "Blindly evaluate the four architecture proposals in ./JUDGE_INPUT.json.",
    "Judge only against the supplied task and preregistered rubric.",
    "Do not infer which skill or architecture produced a candidate.",
    "Use the candidate identifiers exactly. Check arithmetic before returning JSON.",
  ].join("\n");
  await writeFile(join(judgeDir, "input.json"), `${JSON.stringify(input, null, 2)}\n`);
  await writeFile(join(judgeDir, "mapping.json"), `${JSON.stringify(mapping, null, 2)}\n`);
  try {
    process.stdout.write(`judge ${scenarioId} repeat=${repeat}\n`);
    await executeCodex({
      cwd: workspace,
      codexHome,
      prompt,
      schema: join(evalRoot, "judge.schema.json"),
      output: scorePath,
      events: eventsPath,
      selectedModel: judgeModel,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function reuseControlRuns({ scenarioId, repeat, outputRoot, controlSource, resume = false }) {
  for (const arm of armsForScenario(scenarioId).filter((item) => item !== "capability-first")) {
    const source = join(controlSource, "runs", scenarioId, `repeat-${repeat}`, arm);
    const target = join(outputRoot, "runs", scenarioId, `repeat-${repeat}`, arm);
    if (resume && (await fileExists(target))) {
      process.stdout.write(`skip reused control ${scenarioId} repeat=${repeat} arm=${arm}\n`);
      continue;
    }
    if (await fileExists(target)) {
      throw new Error(`Refusing to overwrite existing control run: ${target}`);
    }
    await cp(source, target, { recursive: true, errorOnExist: true, force: false });
    process.stdout.write(`reuse control ${scenarioId} repeat=${repeat} arm=${arm}\n`);
  }
}

async function readUsage(path) {
  const lines = (await readFile(path, "utf8")).trim().split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const event = JSON.parse(lines[index]);
    if (event.type === "turn.completed" && event.usage) return event.usage;
  }
  return {};
}

async function writeSummary(outputRoot, selectedScenarios = scenarioIds) {
  const rows = [];
  const usage = {
    generation: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
    judge: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
  };
  for (const scenarioId of selectedScenarios) {
    for (const repeat of [1, 2]) {
      const judgeDir = join(outputRoot, "judges", scenarioId, `repeat-${repeat}`);
      const mapping = JSON.parse(await readFile(join(judgeDir, "mapping.json"), "utf8"));
      const scores = JSON.parse(await readFile(join(judgeDir, "scores.blind.json"), "utf8"));
      const armByCandidate = new Map(mapping.map((item) => [item.candidate, item.arm]));
      for (const score of scores.candidates) {
        const calculatedTotal =
          score.positive.reduce((sum, value) => sum + value, 0) -
          score.negative.reduce((sum, value) => sum + value, 0);
        rows.push({
          scenario: scenarioId,
          repeat,
          arm: armByCandidate.get(score.candidate),
          positive: score.positive,
          negative: score.negative,
          total: calculatedTotal,
          reportedTotal: score.total,
          arithmeticMatches: calculatedTotal === score.total,
          fatal: score.fatal,
          explanation: score.explanation,
        });
      }
      const judgeUsage = await readUsage(join(judgeDir, "events.jsonl"));
      for (const key of Object.keys(usage.judge)) {
        usage.judge[key] += judgeUsage[key] ?? 0;
      }
      for (const arm of armsForScenario(scenarioId)) {
        const runUsage = await readUsage(
          join(outputRoot, "runs", scenarioId, `repeat-${repeat}`, arm, "events.jsonl"),
        );
        for (const key of Object.keys(usage.generation)) {
          usage.generation[key] += runUsage[key] ?? 0;
        }
      }
    }
  }
  const selectedArms = [...new Set(selectedScenarios.flatMap((scenario) => armsForScenario(scenario)))];
  const aggregate = selectedArms.map((arm) => {
    const armRows = rows.filter((row) => row.arm === arm);
    const total = armRows.reduce((sum, row) => sum + row.total, 0);
    return {
      arm,
      cells: armRows.length,
      total,
      mean: Number((total / armRows.length).toFixed(3)),
      fatalCount: armRows.filter((row) => row.fatal).length,
    };
  });
  await writeFile(
    join(outputRoot, "summary.json"),
    `${JSON.stringify({ aggregate, rows, usage }, null, 2)}\n`,
  );
  process.stdout.write(
    `${aggregate.map((item) => `${item.arm}=${item.mean}`).join(" ")}\n`,
  );
}

async function writeManifest(outputRoot, options) {
  const { stdout: codexVersion } = await run("codex", ["--version"], { cwd: root });
  const { stdout: head } = await run("git", ["rev-parse", "HEAD"], { cwd: root });
  const { stdout: candidateCommit } = await run(
    "git",
    [
      "log",
      "-1",
      "--format=%H",
      "--",
      "tests/architecture-evals/candidate",
    ],
    { cwd: root },
  );
  const candidatePath = join(evalRoot, "candidate");
  const { stdout: candidateStatus } = await run(
    "git",
    ["status", "--porcelain", "--", relative(root, candidatePath)],
    { cwd: root },
  );
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    repositoryHead: head.trim(),
    candidateCommit: candidateCommit.trim(),
    candidateTreeHash: await hashDirectory(candidatePath),
    candidateWorktreeDirty: candidateStatus.trim() !== "",
    codexVersion: codexVersion.trim(),
    generationModel: model,
    judgeModel,
    framing,
    arms: [...new Set(options.scenarios.flatMap((scenario) => armsForScenario(scenario)))],
    scenarioArms: Object.fromEntries(
      options.scenarios.map((scenario) => [scenario, armsForScenario(scenario)]),
    ),
    scenarios: options.scenarios,
    repeats: 2,
    generationRuns: options.candidateOnly
      ? options.scenarios.length * 2
      : options.scenarios.reduce((total, scenario) => total + armsForScenario(scenario).length * 2, 0),
    blindJudgeRuns: options.scenarios.length * 2,
  };
  if (options.candidateOnly) {
    const controlManifest = JSON.parse(
      await readFile(join(options.controlSource, "manifest.json"), "utf8"),
    );
    const controlPath = relative(root, options.controlSource);
    const { stdout: controlSourceCommit } = await run(
      "git",
      ["log", "-1", "--format=%H", "--", controlPath],
      { cwd: root },
    );
    Object.assign(manifest, {
      reusedControlRuns: options.scenarios.reduce(
        (total, scenario) => total + (armsForScenario(scenario).length - 1) * 2,
        0,
      ),
      controlSource: controlPath,
      controlSourceCommit: controlSourceCommit.trim(),
      controlRepositoryHead: controlManifest.repositoryHead,
    });
  }
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.output, { recursive: true });
  if (options.summaryOnly) {
    await writeSummary(options.output, options.scenarios);
    return;
  }
  const tempBase = await mkdtemp(join(tmpdir(), "nextjs-arch-eval-home-"));
  const codexHome = await prepareCodexHome(tempBase);
  try {
    if (options.judgeOnly) {
      await judgeGroup({
        scenarioId: options.scenario,
        repeat: options.repeat,
        outputRoot: options.output,
        codexHome,
        resume: options.resume,
      });
      return;
    }
    if (!options.smoke) {
      await runCell({
        scenarioId: options.scenario,
        arm: options.arm,
        repeat: options.repeat,
        outputRoot: options.output,
        codexHome,
        resume: options.resume,
      });
      return;
    }

    if (!options.resume || !(await fileExists(join(options.output, "manifest.json")))) {
      await writeManifest(options.output, options);
    }
    for (const scenarioId of options.scenarios) {
      for (const repeat of [1, 2]) {
        if (options.candidateOnly) {
          await reuseControlRuns({
            scenarioId,
            repeat,
            outputRoot: options.output,
            controlSource: options.controlSource,
            resume: options.resume,
          });
          await runCell({
            scenarioId,
            arm: "capability-first",
            repeat,
            outputRoot: options.output,
            codexHome,
            resume: options.resume,
          });
        } else {
          for (const arm of armsForScenario(scenarioId)) {
            await runCell({
              scenarioId,
              arm,
              repeat,
              outputRoot: options.output,
              codexHome,
              resume: options.resume,
            });
          }
        }
        await judgeGroup({
          scenarioId,
          repeat,
          outputRoot: options.output,
          codexHome,
          resume: options.resume,
        });
      }
    }
    await writeSummary(options.output, options.scenarios);
  } finally {
    await rm(tempBase, { recursive: true, force: true });
  }
}

await main();
