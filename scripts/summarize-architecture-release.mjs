import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evalRoot = join(root, "tests", "architecture-evals");
const resultSets = {
  release: {
    candidateCommit: "e7b9bdc8ce47bf79d258ca86c04caccaee14a579",
    names: [
      "release-luna-neutral",
      "release-luna-adversarial",
      "release-sol-neutral",
      "release-sol-adversarial",
    ],
  },
  "release-v3": {
    candidateCommit: "6c35c86246fbd65fecfddef5c0d193f50c739f7d",
    names: [
      "release-v3-luna-neutral",
      "release-v3-luna-adversarial",
      "release-v3-sol-neutral",
      "release-v3-sol-adversarial",
    ],
    disputes: [
      {
        matrix: "release-v3-sol-adversarial",
        scenario: "simple-crud",
        repeat: 2,
        arm: "capability-first",
        result: "dispute-v3-sol-adversarial-simple-crud-repeat-2",
      },
    ],
  },
};
const arms = ["no-skill", "v1.3.2", "layer-first", "capability-first"];
const scenarios = ["simple-crud", "remote-stream", "cross-capability"];

function parseArgs(argv) {
  const options = { resultSet: "release" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") options.output = resolve(argv[++index]);
    else if (arg === "--result-set") options.resultSet = argv[++index];
    else {
      throw new Error(
        "Usage: node scripts/summarize-architecture-release.mjs " +
          "[--result-set release|release-v3] [--output <path>]",
      );
    }
  }
  if (!resultSets[options.resultSet]) {
    throw new Error(`Unknown result set: ${options.resultSet}`);
  }
  return options;
}

function mean(values) {
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

async function loadRows(resultNames) {
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
      generationRuns: manifest.generationRuns,
      reusedControlRuns: manifest.reusedControlRuns ?? 0,
      blindJudgeRuns: manifest.blindJudgeRuns,
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

async function applyDisputes(rows, disputes = []) {
  const adjudications = [];
  for (const dispute of disputes) {
    const judgeRoot = join(
      evalRoot,
      "results",
      dispute.result,
      "judges",
      dispute.scenario,
      `repeat-${dispute.repeat}`,
    );
    const mapping = JSON.parse(await readFile(join(judgeRoot, "mapping.json"), "utf8"));
    const scores = JSON.parse(await readFile(join(judgeRoot, "scores.blind.json"), "utf8"));
    const candidate = mapping.find((item) => item.arm === dispute.arm)?.candidate;
    const replacement = scores.candidates.find((item) => item.candidate === candidate);
    const rowIndex = rows.findIndex(
      (row) =>
        row.matrix === dispute.matrix &&
        row.scenario === dispute.scenario &&
        row.repeat === dispute.repeat &&
        row.arm === dispute.arm,
    );
    if (!candidate || !replacement || rowIndex < 0) {
      throw new Error(`Cannot resolve adjudication: ${JSON.stringify(dispute)}`);
    }
    const calculatedTotal =
      sum(replacement.positive) - sum(replacement.negative);
    const original = rows[rowIndex];
    rows[rowIndex] = {
      ...original,
      positive: replacement.positive,
      negative: replacement.negative,
      total: calculatedTotal,
      reportedTotal: replacement.total,
      arithmeticMatches: calculatedTotal === replacement.total,
      fatal: replacement.fatal,
      explanation: replacement.explanation,
      adjudicatedBy: dispute.result,
    };
    adjudications.push({
      ...dispute,
      candidate,
      original: {
        positive: original.positive,
        negative: original.negative,
        total: original.total,
        fatal: original.fatal,
        explanation: original.explanation,
      },
      replacement: {
        positive: replacement.positive,
        negative: replacement.negative,
        total: calculatedTotal,
        fatal: replacement.fatal,
        explanation: replacement.explanation,
      },
    });
  }
  return adjudications;
}

function summarize({ matrices, rows, usage }, resultSet, adjudications) {
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
    resultSet,
    candidateCommit: resultSets[resultSet].candidateCommit,
    matrices,
    counts: {
      generationRuns: sum(matrices.map((matrix) => matrix.generationRuns)),
      reusedControlRuns: sum(matrices.map((matrix) => matrix.reusedControlRuns)),
      blindJudgeGroups: sum(matrices.map((matrix) => matrix.blindJudgeRuns)),
      additionalBlindJudgeGroups: adjudications.length,
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
    adjudications,
    usage,
    usageCaveat:
      "Usage totals completed event files, includes reused controls in replay sets, and excludes " +
      "timed-out judge attempts.",
  };
}

const options = parseArgs(process.argv.slice(2));
const loaded = await loadRows(resultSets[options.resultSet].names);
const adjudications = await applyDisputes(
  loaded.rows,
  resultSets[options.resultSet].disputes,
);
const report = summarize(loaded, options.resultSet, adjudications);
const output = `${JSON.stringify(report, null, 2)}\n`;
if (options.output) await writeFile(options.output, output);
else process.stdout.write(output);
