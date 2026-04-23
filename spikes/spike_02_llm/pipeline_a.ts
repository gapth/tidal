import OpenAI from "openai";
import type { ChatMessage, Prompt } from "./types.ts";

const SYSTEM = `You are a real-time assistant for Tomi, a YouTube live streamer who negotiates car deals for viewers.
Your job: scan recent chat and surface what matters RIGHT NOW.
Respond with 1-3 bullet points. Each bullet is one concrete, actionable item the streamer should know or respond to.
Focus on: questions the audience is asking repeatedly, superchats, notable viewer moments, or topics gaining traction.
Skip: spam, bot commands (!discord etc.), generic praise, and noise.
Format strictly: one bullet per line, starting with "- ".`;

export async function runPipelineA(
  client: OpenAI,
  model: string,
  window: ChatMessage[],
): Promise<{ prompts: Prompt[]; latencyMs: number }> {
  const chatText = window
    .map((m) => `[${m.publishedAt.substring(11, 19)}] ${m.text}`)
    .join("\n");

  const t0 = Date.now();
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Chat window (${window.length} messages, last ~${Math.ceil(window.length / 16)} min):\n\n${chatText}\n\nWhat should Tomi know right now?`,
      },
    ],
    max_tokens: 250,
    temperature: 0.3,
  });
  const latencyMs = Date.now() - t0;

  const raw = response.choices[0]?.message?.content ?? "";
  const prompts = raw
    .split("\n")
    .filter((line) => /^[-•*]/.test(line.trim()))
    .map((line) => ({ text: line.replace(/^[-•*]\s*/, "").trim() }))
    .filter((p) => p.text.length > 5);

  if (prompts.length === 0 && raw.trim().length > 0) {
    prompts.push({ text: raw.trim() });
  }

  return { prompts, latencyMs };
}
