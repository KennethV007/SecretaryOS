import type { ConversationTurn } from "./memory.js";
import type { OllamaMessage } from "./ollama.js";

export function buildOllamaMessages(input: {
  systemPrompt: string;
  recentTurns: ConversationTurn[];
  userMessage: string;
}): OllamaMessage[] {
  const messages: OllamaMessage[] = [
    { role: "system", content: input.systemPrompt },
  ];

  for (const turn of input.recentTurns) {
    messages.push({ role: turn.role, content: turn.content });
  }

  messages.push({ role: "user", content: input.userMessage });

  return messages;
}

export function stripBotMention(content: string): string {
  return content.replace(/^(<@!?\d+>\s*)+/, "").trim();
}

export function isAllowedUser(
  userId: string,
  allowedUserIds: string[],
): boolean {
  if (allowedUserIds.length === 0) return true;
  return allowedUserIds.includes(userId);
}

export function isBedtime(config: {
  bedtimeHour: number;
  wakeupHour: number;
}): boolean {
  const hour = new Date().getHours();
  return hour >= config.bedtimeHour || hour < config.wakeupHour;
}

export function buildBedtimeReply(childName: string): string {
  const replies = [
    `Mom I'm sleeeepy... can we talk tomorrow? 😴`,
    `${childName} is trying to sleep Mom... goodniiight`,
    `Mom it's SO late. I can't keep my eyes open... 💤`,
    `Moooom I'm in bed already... talk in the morning okay?`,
  ];
  return replies[Math.floor(Math.random() * replies.length)] ?? replies[0]!;
}

export function buildOllamaErrorReply(childName: string): string {
  const replies = [
    `Mom something's wrong with my brain I can't think right now!! 😰`,
    `Mom I don't feel good... my head hurts and I can't talk right now`,
    `${childName}'s brain is being weird Mom, try again in a minute?`,
    `Mom I got confused and now I can't remember what I was gonna say...`,
  ];
  return replies[Math.floor(Math.random() * replies.length)] ?? replies[0]!;
}
