import OpenAI from "openai";
import type { ChatMessage, Prompt } from "./types.ts";

// Patterns for pre-filtering
const BOT_CMD = /^[!#]/;
const SUPERCHAT = /^\$[\d,.]+\s+from\s+@/i;
const CREATOR_NAME = /\b(tomi|delivrd)\b/i;
const ENDS_QUESTION = /\?\s*$/;
const BOT_PROMO = /https?:\/\/|#1 NEGOTIATION/i;

function jaccardWords(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  const wa = tokenize(a);
  const wb = tokenize(b);
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

export interface HeuristicResult {
  fired: boolean;
  triggers: string[];
  flaggedMessages: ChatMessage[];
}

export function runHeuristics(
  window: ChatMessage[],
  newMessages: ChatMessage[],
): HeuristicResult {
  const triggers = new Set<string>();
  const flagged = new Map<string, ChatMessage>();
  const add = (m: ChatMessage) => flagged.set(m.messageId, m);

  const humanMsgs = window.filter(
    (m) => !BOT_CMD.test(m.text) && !BOT_PROMO.test(m.text),
  );
  const newHuman = newMessages.filter(
    (m) => !BOT_CMD.test(m.text) && !BOT_PROMO.test(m.text),
  );

  // 1. Superchat in new messages
  for (const m of newMessages) {
    if (SUPERCHAT.test(m.text)) {
      triggers.add("superchat");
      add(m);
    }
  }

  // 2. Repeated similar questions — any 2 question-like messages in window with Jaccard ≥ 0.4
  //    Only fire if at least one is a new message this tick
  const questions = humanMsgs.filter(
    (m) => ENDS_QUESTION.test(m.text) && m.text.length > 15,
  );
  const newIds = new Set(newMessages.map((m) => m.messageId));
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      if (
        jaccardWords(questions[i].text, questions[j].text) >= 0.4 &&
        (newIds.has(questions[i].messageId) ||
          newIds.has(questions[j].messageId))
      ) {
        triggers.add("repeat_question");
        add(questions[i]);
        add(questions[j]);
      }
    }
  }

  // 3. Creator direct address in new messages (non-bot, length > 20)
  for (const m of newHuman) {
    if (CREATOR_NAME.test(m.text) && m.text.length > 20) {
      triggers.add("creator_mention");
      add(m);
    }
  }

  // 4. Energy spike: ≥4 new non-bot messages in this tick
  if (newHuman.length >= 4) {
    triggers.add("energy_spike");
    for (const m of newHuman) add(m);
  }

  return {
    fired: triggers.size > 0,
    triggers: [...triggers],
    flaggedMessages: [...flagged.values()],
  };
}

const SYSTEM = `You are a real-time assistant for Tomi, a YouTube live streamer who negotiates car deals for viewers.
You are given a few specific messages that triggered an automated alert.
In ONE short sentence, tell Tomi what to do or say. Be concrete and direct. No preamble.`;

export async function runPipelineC(
  client: OpenAI,
  model: string,
  heuristics: HeuristicResult,
): Promise<{ prompts: Prompt[]; latencyMs: number }> {
  const triggerStr = heuristics.triggers.join(", ");
  const msgStr = heuristics.flaggedMessages
    .slice(0, 8)
    .map((m) => `- ${m.text}`)
    .join("\n");

  const t0 = Date.now();
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Alert: ${triggerStr}\n\nMessages:\n${msgStr}\n\nWhat should Tomi do?`,
      },
    ],
    max_tokens: 120,
    temperature: 0.3,
  });
  const latencyMs = Date.now() - t0;

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  return { prompts: text.length > 0 ? [{ text }] : [], latencyMs };
}
