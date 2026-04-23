/**
 * Evaluates harness results against the hand-labeled set.
 *
 * Usage:
 *   npx tsx --env-file=.env.local spikes/spike_02_llm/evaluate.ts
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PipelineRun, LabeledMoment } from "./types.ts";
import { loadMessages } from "./replay.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, "results");
const LABEL_PATH = join(__dirname, "label_set.json");
const DATA_PATH = join(__dirname, "../spike_01_ingest/results_api.jsonl");

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function loadResults(file: string): PipelineRun[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as PipelineRun);
}

interface EvalResult {
  runId: string;
  pipeline: string;
  model: string;
  windowSecs: number;
  totalRuns: number;
  runsWithPrompts: number;
  callsPerMinute: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  recall: number; // labeled moments caught / total labeled moments
  precision: number; // runs-with-prompts covering ≥1 labeled moment / total runs-with-prompts
  caughtMomentIds: string[];
  missedMomentIds: string[];
}

function evaluate(
  runId: string,
  runs: PipelineRun[],
  labels: LabeledMoment[],
  msgTimestamps: Map<string, number>,
): EvalResult {
  const runsWithPrompts = runs.filter((r) => r.prompts.length > 0);

  // Latency
  const latencies = runsWithPrompts
    .map((r) => r.latencyMs)
    .sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  // Duration of the replay in minutes
  const times = runs.map((r) => r.tickTimeMs);
  const durationMin =
    times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 60_000 : 10;
  const callsPerMinute = runsWithPrompts.length / durationMin;

  // Coverage: for each run with prompts, compute the time window it covers
  const caughtIds = new Set<string>();
  let precisionNumer = 0;

  for (const run of runsWithPrompts) {
    const windowStart = run.tickTimeMs - run.windowSecs * 1000;
    const windowEnd = run.tickTimeMs;
    let caught = false;
    for (const label of labels) {
      const t = msgTimestamps.get(label.messageId);
      if (t !== undefined && t >= windowStart && t <= windowEnd) {
        caughtIds.add(label.messageId);
        caught = true;
      }
    }
    if (caught) precisionNumer++;
  }

  const recall = labels.length > 0 ? caughtIds.size / labels.length : 0;
  const precision =
    runsWithPrompts.length > 0 ? precisionNumer / runsWithPrompts.length : 0;

  const missedIds = labels
    .map((l) => l.messageId)
    .filter((id) => !caughtIds.has(id));

  const pipeline = runs[0]?.pipeline ?? "?";
  const model = runs[0]?.model ?? "?";
  const windowSecs = runs[0]?.windowSecs ?? 0;

  return {
    runId,
    pipeline,
    model,
    windowSecs,
    totalRuns: runs.length,
    runsWithPrompts: runsWithPrompts.length,
    callsPerMinute: Math.round(callsPerMinute * 10) / 10,
    latencyP50: p50,
    latencyP95: p95,
    latencyP99: p99,
    recall: Math.round(recall * 1000) / 1000,
    precision: Math.round(precision * 1000) / 1000,
    caughtMomentIds: [...caughtIds],
    missedMomentIds: missedIds,
  };
}

function formatTable(rows: EvalResult[]): string {
  const cols = [
    { key: "runId", label: "Run", width: 28 },
    { key: "runsWithPrompts", label: "Prompts", width: 8 },
    { key: "callsPerMinute", label: "Calls/min", width: 10 },
    { key: "latencyP50", label: "P50 ms", width: 8 },
    { key: "latencyP95", label: "P95 ms", width: 8 },
    { key: "latencyP99", label: "P99 ms", width: 8 },
    { key: "recall", label: "Recall", width: 8 },
    { key: "precision", label: "Precision", width: 10 },
  ];

  const header = cols.map((c) => c.label.padEnd(c.width)).join("| ");
  const sep = cols.map((c) => "-".repeat(c.width)).join("+-");
  const body = rows
    .map((r) =>
      cols
        .map((c) => {
          const v = r[c.key as keyof EvalResult];
          return String(v).padEnd(c.width);
        })
        .join("| "),
    )
    .join("\n");

  return [header, sep, body].join("\n");
}

function samplePrompts(runs: PipelineRun[], n = 3): string {
  const runsWithPrompts = runs.filter((r) => r.prompts.length > 0);
  if (runsWithPrompts.length === 0) return "  (none)";
  // Pick evenly spaced samples
  const step = Math.max(1, Math.floor(runsWithPrompts.length / n));
  return runsWithPrompts
    .filter((_, i) => i % step === 0)
    .slice(0, n)
    .map((r) => {
      const t = new Date(r.tickTimeMs).toISOString().substring(11, 19);
      return r.prompts
        .map((p) => `  [${t}] ${p.text.substring(0, 120)}`)
        .join("\n");
    })
    .join("\n");
}

async function main() {
  const labels = JSON.parse(
    readFileSync(LABEL_PATH, "utf8"),
  ) as LabeledMoment[];
  const messages = loadMessages(DATA_PATH);
  const msgTimestamps = new Map(
    messages.map((m) => [m.messageId, new Date(m.publishedAt).getTime()]),
  );

  console.log(`Evaluating against ${labels.length} labeled moments\n`);

  const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    console.error("No result files found. Run harness.ts first.");
    process.exit(1);
  }

  const evals: EvalResult[] = [];
  const promptSamples: Record<string, string> = {};

  for (const file of files.sort()) {
    const runId = file.replace(".jsonl", "");
    const runs = loadResults(join(RESULTS_DIR, file));
    if (runs.length === 0) continue;

    const ev = evaluate(runId, runs, labels, msgTimestamps);
    evals.push(ev);
    promptSamples[runId] = samplePrompts(runs);
  }

  // Sort by recall desc, then precision desc
  evals.sort((a, b) => b.recall - a.recall || b.precision - a.precision);

  const table = formatTable(evals);
  console.log("## Results\n");
  console.log(table);
  console.log();

  // Missed moments for best run
  const best = evals[0];
  if (best) {
    const missed = labels.filter((l) =>
      best.missedMomentIds.includes(l.messageId),
    );
    console.log(`\n## Missed moments (${best.runId})`);
    for (const m of missed) {
      console.log(`  [${m.category}] ${m.text.substring(0, 80)}`);
    }
  }

  // Sample prompts
  console.log("\n## Sample prompts per run");
  for (const ev of evals) {
    console.log(`\n### ${ev.runId}`);
    console.log(promptSamples[ev.runId]);
  }

  // Write summary markdown
  const summaryPath = join(RESULTS_DIR, "summary.md");
  const missedList = best
    ? labels
        .filter((l) => best.missedMomentIds.includes(l.messageId))
        .map((m) => `- [${m.category}] ${m.text.substring(0, 90)}`)
        .join("\n")
    : "";

  const promptSection = evals
    .map((ev) => `### ${ev.runId}\n${promptSamples[ev.runId]}`)
    .join("\n\n");

  const summary = `# Spike 2 — LLM Pipeline Evaluation Results

## Data
- Source: spike_01_ingest/results_api.jsonl
- Unique messages: ${messages.length}
- Label set: ${labels.length} hand-labeled important moments
- Stream: automotive/car-deal negotiation (~16 msgs/min, ~10 min)

## Results Table

\`\`\`
${table}
\`\`\`

## Missed Moments (best run: ${best?.runId ?? "N/A"})

${missedList}

## Sample Prompts

${promptSection}
`;

  writeFileSync(summaryPath, summary);
  console.log(`\nSummary written to results/summary.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
