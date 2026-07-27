import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evalRoot = join(root, "tests", "architecture-evals");
const resultNames = [
  "release-luna-neutral",
  "release-luna-adversarial",
  "release-sol-neutral",
  "release-sol-adversarial",
];
const arms = ["no-skill", "v1.3.2", "layer-first", "capability-first"];
const scenarios = ["simple-crud", "remote-stream", "cross-capability"];

function parseArgs(argv) {
  if (argv.length === 0) return {};
  if (argv.length === 2 && argv[0] === "--output") {
    return { output: resolve(argv[1]) };
  }
  throw new Error("Usage: node scripts/summarize-architecture-release.mjs [--output <path>]");
}

function mean(values) {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

async function loadRows() {
  const matrices = [];
  const rows = [];
  const usage = {
    generation: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
    judge: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
  };

  for (const name of resultNames) {
    const resultRoot = join(evalRoot, "results", name);
    const manifest = JSON.parse(await readFile(join(resultRoot, "manifest.json"), "utf8"));
    const summary = JSON.parse(await readFile(join(resultRoot, "summary.json"), "utf8"));
    matrices.push({
      name,
      generationModel: manifest.generationModel,
      judgeModel: manifest.judgeModel,
      framing: manifest.framing,
      repositoryHead: manifest.repositoryHead,
    });
    rows.push(
      ...summary.rows.map((row) => ({
        ...row,
        matrix: name,
        generationModel: manifest.generationModel,
        framing: manifest.framing,
      })),
    );
    for (const stage of Object.keys(usage)) {
      for (const key of Object.keys(usage[stage])) {
        usage[stage][key] += summary.usage[stage][key] ?? 0;
      }
    }
  }

  return { matrices, rows, usage };
}

function summarize({ matrices, rows, usage }) {
  const overall = arms.map((arm) => {
    const armRows = rows.filter((row) => row.arm === arm);
    return {
      arm,
      cells: armRows.length,
      total: sum(armRows.map((row) => row.total)),
      mean: mean(armRows.map((row) => row.total)),
      minimum: Math.min(...armRows.map((row) => row.total)),
      negativeViolations: sum(armRows.flatMap((row) => row.negative)),
      fatalCount: armRows.filter((row) => row.fatal).length,
    };
  });
  const perScenario = arms.map((arm) => ({
    arm,
    scenarios: Object.fromEntries(
      scenarios.map((scenario) => [
        scenario,
        mean(
          rows
            .filter((row) => row.arm === arm && row.scenario === scenario)
            .map((row) => row.total),
        ),
      ]),
    ),
  }));
  const candidateRows = rows.filter((row) => row.arm === "capability-first");
  const paired = arms
    .filter((arm) => arm !== "capability-first")
    .map((control) => {
      let wins = 0;
      let ties = 0;
      let losses = 0;
      for (const candidate of candidateRows) {
        const controlRow = rows.find(
          (row) =>
            row.arm === control &&
            row.matrix === candidate.matrix &&
            row.scenario === candidate.scenario &&
            row.repeat === candidate.repeat,
        );
        if (!controlRow) throw new Error(`Missing paired control row for ${control}.`);
        if (candidate.total > controlRow.total) wins += 1;
        else if (candidate.total === controlRow.total) ties += 1;
        else losses += 1;
      }
      return {
        control,
        cells: candidateRows.length,
        wins,
        ties,
        losses,
        tieOrBeatRate: Number(((wins + ties) / candidateRows.length).toFixed(3)),
      };
    });

  const overallByArm = new Map(overall.map((item) => [item.arm, item]));
  const scenarioByArm = new Map(perScenario.map((item) => [item.arm, item.scenarios]));
  const candidateOverall = overallByArm.get("capability-first");
  const controlArms = arms.filter((arm) => arm !== "capability-first");
  const automaticCriteria = {
    noFatalCandidateCell: candidateOverall.fatalCount === 0,
    noCandidateNegativeViolation: candidateOverall.negativeViolations === 0,
    candidateLeadsOverall: controlArms.every(
      (arm) => candidateOverall.mean > overallByArm.get(arm).mean,
    ),
    candidateLeadsEveryScenario: scenarios.every((scenario) =>
      controlArms.every(
        (arm) =>
          scenarioByArm.get("capability-first")[scenario] > scenarioByArm.get(arm)[scenario],
      ),
    ),
    candidateBeatsNoSkillByHalfPoint:
      candidateOverall.mean - overallByArm.get("no-skill").mean >= 0.5,
    candidateTiesOrBeatsEveryControlInThreeQuarters:
      paired.every((item) => item.tieOrBeatRate >= 0.75),
    noCandidateCellBelowEight: candidateOverall.minimum >= 8,
    judgeArithmeticMatches: rows.every((row) => row.arithmeticMatches),
  };

  return {
    candidateCommit: "e7b9bdc8ce47bf79d258ca86c04caccaee14a579",
    matrices,
    counts: {
      generationRuns: 96,
      blindJudgeGroups: 24,
      scoredRows: rows.length,
      candidateCells: candidateRows.length,
    },
    overall,
    perScenario,
    paired,
    candidateExceptions: candidateRows
      .filter(
        (row) =>
          row.total < 10 ||
          row.fatal ||
          row.negative.some((violation) => violation !== 0),
      )
      .map((row) => ({
        matrix: row.matrix,
        scenario: row.scenario,
        repeat: row.repeat,
        total: row.total,
        positive: row.positive,
        negative: row.negative,
        fatal: row.fatal,
        explanation: row.explanation,
      })),
    automaticCriteria,
    automaticPass: Object.values(automaticCriteria).every(Boolean),
    usage,
    usageCaveat:
      "Usage excludes timed-out judge attempts because the runner persists only complete events.",
  };
}

const options = parseArgs(process.argv.slice(2));
const report = summarize(await loadRows());
const output = `${JSON.stringify(report, null, 2)}\n`;
if (options.output) await writeFile(options.output, output);
else process.stdout.write(output);
