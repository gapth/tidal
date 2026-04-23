import OpenAI from "openai";
import type { ChatMessage, Prompt } from "./types.ts";

const CLUSTER_SYSTEM = `You are analyzing YouTube live chat for a car-deal negotiation streamer.
Group the messages into 2-4 topic clusters. Skip bot commands and pure spam.
For each cluster use this exact format:
CLUSTER: [2-4 word name]
MESSAGES: [verbatim msg 1] | [verbatim msg 2]
COUNT: [total similar messages in this cluster]`;

const PRIORITIZE_SYSTEM = `You are a real-time assistant for Tomi, a YouTube live streamer who negotiates car deals.
Given topic clusters from recent live chat, identify the 1-2 clusters Tomi should address RIGHT NOW.
For each, write exactly one actionable sentence — what should Tomi say or do?
Format: one bullet per line starting with "- ".`;

export async function runPipelineB(
  client: OpenAI,
  fastModel: string,
  targetModel: string,
  window: ChatMessage[],
): Promise<{ prompts: Prompt[]; latencyMs: number; callCount: 2 }> {
  const chatText = window.map((m) => m.text).join("\n");

  const t0 = Date.now();

  const clusterResp = await client.chat.completions.create({
    model: fastModel,
    messages: [
      { role: "system", content: CLUSTER_SYSTEM },
      { role: "user", content: chatText },
    ],
    max_tokens: 350,
    temperature: 0.2,
  });

  const clusters = clusterResp.choices[0]?.message?.content ?? "";

  const prioritizeResp = await client.chat.completions.create({
    model: targetModel,
    messages: [
      { role: "system", content: PRIORITIZE_SYSTEM },
      {
        role: "user",
        content: `Chat clusters from the last ~60 seconds:\n\n${clusters}\n\nWhich 1-2 should Tomi address right now?`,
      },
    ],
    max_tokens: 200,
    temperature: 0.3,
  });

  const latencyMs = Date.now() - t0;
  const raw = prioritizeResp.choices[0]?.message?.content ?? "";

  const prompts = raw
    .split("\n")
    .filter((line) => /^[-•*]/.test(line.trim()))
    .map((line) => ({ text: line.replace(/^[-•*]\s*/, "").trim() }))
    .filter((p) => p.text.length > 5);

  if (prompts.length === 0 && raw.trim().length > 0) {
    prompts.push({ text: raw.trim() });
  }

  return { prompts, latencyMs, callCount: 2 };
}
