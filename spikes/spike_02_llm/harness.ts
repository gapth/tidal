/**
 * Spike 2 harness: replay chat log through Pipelines A/B/C and measure LLM latency + quality.
 *
 * Usage:
 *   npx tsx --env-file=.env.local spikes/spike_02_llm/harness.ts
 *   npx tsx --env-file=.env.local spikes/spike_02_llm/harness.ts --heavy A   # run winning pipeline with gpt-4-turbo
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { loadMessages, buildTicks, getWindow, type Tick } from "./replay.ts";
import { runPipelineA } from "./pipeline_a.ts";
import { runPipelineB } from "./pipeline_b.ts";
import { runPipelineC, runHeuristics } from "./pipeline_c.ts";
import type { PipelineRun, ChatMessage } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "../spike_01_ingest/results_api.jsonl");
const RESULTS_DIR = join(__dirname, "results");

const MODELS = {
  fast: "gpt-4o-mini",
  balanced: "gpt-4o",
  heavy: "gpt-4-turbo",
};

// Trigger every ≥5 new messages AND ≥25s simulated elapsed since last prompt (pipelines A/B)
const AB_MIN_NEW_MSGS = 5;
const AB_MIN_ELAPSED_MS = 25_000;
// Pipeline C: min 12s cooldown between prompts
const C_COOLDOWN_MS = 12_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ts(tickMs: number) {
  return new Date(tickMs).toISOString().substring(11, 19);
}

// ── Pipeline A/B runner ────────────────────────────────────────────────────────
async function runAB(
  pipeline: "A" | "B",
  model: string,
  windowSecs: number,
  messages: ChatMessage[],
  ticks: Tick[],
  client: OpenAI,
): Promise<PipelineRun[]> {
  const results: PipelineRun[] = [];
  let lastPromptTimeMs = -Infinity;
  let msgsSinceLastPrompt = 0;

  for (const tick of ticks) {
    msgsSinceLastPrompt += tick.newMessages.length;
    const elapsed = tick.tickTimeMs - lastPromptTimeMs;

    if (msgsSinceLastPrompt < AB_MIN_NEW_MSGS || elapsed < AB_MIN_ELAPSED_MS)
      continue;

    const window = getWindow(messages, tick.tickTimeMs, windowSecs * 1000);
    if (window.length < 3) continue;

    try {
      let prompts, latencyMs, callCount: 1 | 2;
      if (pipeline === "A") {
        ({ prompts, latencyMs } = await runPipelineA(client, model, window));
        callCount = 1;
      } else {
        ({ prompts, latencyMs, callCount } = await runPipelineB(
          client,
          MODELS.fast,
          model,
          window,
        ));
      }

      const run: PipelineRun = {
        pipeline,
        model,
        windowSecs,
        tickTimeMs: tick.tickTimeMs,
        latencyMs,
        messagesInWindow: window.length,
        prompts,
        callCount,
      };
      results.push(run);
      console.log(
        `  ${ts(tick.tickTimeMs)} | lat=${latencyMs}ms | window=${window.length} | prompts=${prompts.length}`,
      );
      lastPromptTimeMs = tick.tickTimeMs;
      msgsSinceLastPrompt = 0;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ERROR at ${ts(tick.tickTimeMs)}: ${msg}`);
    }

    await sleep(pipeline === "B" ? 200 : 150);
  }

  return results;
}

// ── Pipeline C runner ──────────────────────────────────────────────────────────
async function runC(
  model: string,
  messages: ChatMessage[],
  ticks: Tick[],
  client: OpenAI,
): Promise<PipelineRun[]> {
  const results: PipelineRun[] = [];
  let lastPromptTimeMs = -Infinity;

  for (const tick of ticks) {
    if (tick.tickTimeMs - lastPromptTimeMs < C_COOLDOWN_MS) continue;

    const window = getWindow(messages, tick.tickTimeMs, 90_000);
    const h = runHeuristics(window, tick.newMessages);
    if (!h.fired) continue;

    try {
      const { prompts, latencyMs } = await runPipelineC(client, model, h);
      const run: PipelineRun = {
        pipeline: "C",
        model,
        windowSecs: 90,
        tickTimeMs: tick.tickTimeMs,
        latencyMs,
        messagesInWindow: window.length,
        prompts,
        triggerReason: h.triggers.join(","),
        callCount: 1,
      };
      results.push(run);
      console.log(
        `  ${ts(tick.tickTimeMs)} | triggers=${h.triggers.join(",")} | flagged=${h.flaggedMessages.length} | lat=${latencyMs}ms | prompts=${prompts.length}`,
      );
      lastPromptTimeMs = tick.tickTimeMs;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ERROR at ${ts(tick.tickTimeMs)}: ${msg}`);
    }

    await sleep(150);
  }

  return results;
}

// ── Save results ───────────────────────────────────────────────────────────────
function save(runId: string, results: PipelineRun[]) {
  const path = join(RESULTS_DIR, `${runId}.jsonl`);
  writeFileSync(path, results.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(
    `  → saved ${results.length} records to results/${runId}.jsonl\n`,
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const heavyIdx = args.indexOf("--heavy");
  const heavyPipeline =
    heavyIdx !== -1 ? (args[heavyIdx + 1] as "A" | "B" | "C") : null;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const messages = loadMessages(DATA_PATH);
  const ticks = buildTicks(messages, 2500);
  console.log(
    `Loaded ${messages.length} unique messages | ${ticks.length} ticks\n`,
  );

  if (heavyPipeline) {
    // Single heavy-model run on specified pipeline
    const runId = `${heavyPipeline}_${MODELS.heavy}`;
    console.log(`=== ${runId} (heavy model run) ===`);
    let results: PipelineRun[];
    if (heavyPipeline === "A") {
      results = await runAB("A", MODELS.heavy, 60, messages, ticks, client);
    } else if (heavyPipeline === "B") {
      results = await runAB("B", MODELS.heavy, 60, messages, ticks, client);
    } else {
      results = await runC(MODELS.heavy, messages, ticks, client);
    }
    save(runId, results);
    return;
  }

  // ── Standard runs ─────────────────────────────────────────────────────────

  // Pipeline A: window size sweep (gpt-4o-mini)
  for (const windowSecs of [30, 60, 90]) {
    const runId = `A_${windowSecs}s_${MODELS.fast}`;
    console.log(`=== ${runId} ===`);
    save(
      runId,
      await runAB("A", MODELS.fast, windowSecs, messages, ticks, client),
    );
  }

  // Pipeline A: balanced model at best window (60s)
  {
    const runId = `A_60s_${MODELS.balanced}`;
    console.log(`=== ${runId} ===`);
    save(runId, await runAB("A", MODELS.balanced, 60, messages, ticks, client));
  }

  // Pipeline B: fast and balanced
  for (const model of [MODELS.fast, MODELS.balanced]) {
    const runId = `B_${model}`;
    console.log(`=== ${runId} ===`);
    save(runId, await runAB("B", model, 60, messages, ticks, client));
  }

  // Pipeline C: fast and balanced
  for (const model of [MODELS.fast, MODELS.balanced]) {
    const runId = `C_${model}`;
    console.log(`=== ${runId} ===`);
    save(runId, await runC(model, messages, ticks, client));
  }

  console.log("Harness complete. Run evaluate.ts next.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
