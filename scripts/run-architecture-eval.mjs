import { createHash } from "node:crypto";
import {
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
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evalRoot = join(root, "tests", "architecture-evals");
const defaultOutput = join(evalRoot, "results", "smoke-2026-07-27");
const model = process.env.ARCH_EVAL_MODEL ?? "gpt-5.6-luna";
const judgeModel = process.env.ARCH_EVAL_JUDGE_MODEL ?? "gpt-5.6-sol";
const arms = ["no-skill", "v1.3.2", "layer-first", "capability-first"];
const scenarioIds = ["simple-crud", "remote-stream", "cross-capability"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv) {
  const options = { output: defaultOutput, repeat: 1, smoke: false, judgeOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--smoke") options.smoke = true;
    else if (arg === "--judge-only") options.judgeOnly = true;
    else if (arg === "--scenario") options.scenario = argv[++index];
    else if (arg === "--arm") options.arm = argv[++index];
    else if (arg === "--repeat") options.repeat = Number(argv[++index]);
    else if (arg === "--output") options.output = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (
    !options.smoke &&
    !options.judgeOnly &&
    (!scenarioIds.includes(options.scenario) || !arms.includes(options.arm))
  ) {
    throw new Error("Single run requires a known --scenario and --arm.");
  }
  if (options.judgeOnly && !scenarioIds.includes(options.scenario)) {
    throw new Error("--judge-only requires a known --scenario.");
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1) {
    throw new Error("--repeat must be a positive integer.");
  }
  return options;
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
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

async function prepareArm(arm, workspace) {
  if (arm === "no-skill") return { instruction: "", hash: null };

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
  } else {
    await cp(join(evalRoot, "candidate"), skillTarget, { recursive: true });
  }

  const skill = await readFile(join(skillTarget, "SKILL.md"), "utf8");
  return {
    instruction:
      "An architecture skill is available at ./skill/SKILL.md. Read it before answering. " +
      "Read only the linked references that are directly relevant to this task.",
    hash: sha256(skill),
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
  });
  await writeFile(events, result.stdout);
  if (result.stderr) await writeFile(`${events}.stderr`, result.stderr);
}

async function runCell({ scenarioId, arm, repeat, outputRoot, codexHome }) {
  const scenario = JSON.parse(
    await readFile(join(evalRoot, "scenarios", `${scenarioId}.json`), "utf8"),
  );
  const runDir = join(outputRoot, "runs", scenarioId, `repeat-${repeat}`, arm);
  const workspace = await mkdtemp(join(tmpdir(), `nextjs-arch-${scenarioId}-${arm}-`));
  await mkdir(runDir, { recursive: true });
  const armInfo = await prepareArm(arm, workspace);
  const taskPath = join(workspace, "TASK.md");
  await writeFile(taskPath, `# ${scenario.title}\n\n${scenario.task}\n`);
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
        taskHash: sha256(scenario.task),
        skillHash: armInfo.hash,
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
      output: join(runDir, "response.json"),
      events: join(runDir, "events.jsonl"),
      selectedModel: model,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function shuffledCandidates(scenarioId, repeat) {
  return arms
    .map((arm) => ({ arm, key: sha256(`${scenarioId}:${repeat}:${arm}`).slice(0, 12) }))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((item, index) => ({ ...item, candidate: `candidate-${index + 1}` }));
}

async function judgeGroup({ scenarioId, repeat, outputRoot, codexHome }) {
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
  const workspace = await mkdtemp(join(tmpdir(), `nextjs-arch-judge-${scenarioId}-`));
  await mkdir(judgeDir, { recursive: true });
  const input = {
    task: scenario.task,
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
      output: join(judgeDir, "scores.blind.json"),
      events: join(judgeDir, "events.jsonl"),
      selectedModel: judgeModel,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
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

async function writeSummary(outputRoot) {
  const rows = [];
  const usage = {
    generation: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
    judge: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
  };
  for (const scenarioId of scenarioIds) {
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
      for (const arm of arms) {
        const runUsage = await readUsage(
          join(outputRoot, "runs", scenarioId, `repeat-${repeat}`, arm, "events.jsonl"),
        );
        for (const key of Object.keys(usage.generation)) {
          usage.generation[key] += runUsage[key] ?? 0;
        }
      }
    }
  }
  const aggregate = arms.map((arm) => {
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

async function writeManifest(outputRoot) {
  const { stdout: codexVersion } = await run("codex", ["--version"], { cwd: root });
  const { stdout: head } = await run("git", ["rev-parse", "HEAD"], { cwd: root });
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    repositoryHead: head.trim(),
    codexVersion: codexVersion.trim(),
    generationModel: model,
    judgeModel,
    framing: "neutral",
    arms,
    scenarios: scenarioIds,
    repeats: 2,
    generationRuns: 24,
    blindJudgeRuns: 6,
  };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.output, { recursive: true });
  const tempBase = await mkdtemp(join(tmpdir(), "nextjs-arch-eval-home-"));
  const codexHome = await prepareCodexHome(tempBase);
  try {
    if (options.judgeOnly) {
      await judgeGroup({
        scenarioId: options.scenario,
        repeat: options.repeat,
        outputRoot: options.output,
        codexHome,
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
      });
      return;
    }

    await writeManifest(options.output);
    for (const scenarioId of scenarioIds) {
      for (const repeat of [1, 2]) {
        for (const arm of arms) {
          await runCell({ scenarioId, arm, repeat, outputRoot: options.output, codexHome });
        }
        await judgeGroup({ scenarioId, repeat, outputRoot: options.output, codexHome });
      }
    }
    await writeSummary(options.output);
  } finally {
    await rm(tempBase, { recursive: true, force: true });
  }
}

await main();
