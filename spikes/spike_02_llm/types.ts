export interface ChatMessage {
  messageId: string;
  text: string;
  publishedAt: string; // ISO 8601
  receivedAt: number; // Unix ms
  latencyMs: number;
  pollIndex: number;
}

export interface Prompt {
  text: string;
}

export interface PipelineRun {
  pipeline: "A" | "B" | "C";
  model: string;
  windowSecs: number;
  tickTimeMs: number; // simulated time (last message's epoch ms)
  latencyMs: number; // wall-clock LLM call time
  messagesInWindow: number;
  prompts: Prompt[];
  triggerReason?: string; // pipeline C: which heuristics fired
  callCount: number; // 1 for A/C, 2 for B
}

export interface LabeledMoment {
  messageId: string;
  text: string;
  category:
    | "superchat"
    | "direct_question"
    | "repeat_question"
    | "client_feedback"
    | "service_question"
    | "interesting_topic";
  importance: "high" | "medium";
  note: string;
}
