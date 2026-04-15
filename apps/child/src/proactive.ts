import { isBedtime } from "./index.js";
import type { OllamaClient } from "./ollama.js";

export type ProactiveCategory =
  | "school_report"
  | "homework_question"
  | "discovery"
  | "emotional_check_in"
  | "hunger_complaint"
  | "imagination_share"
  | "bedtime_announcement";

const MESSAGE_POOLS: Record<ProactiveCategory, string[]> = {
  school_report: [
    "MOM!! you will NOT believe what happened at school today 😱",
    "Mom I have SO much to tell you about today",
    "Mom school was crazy today I need to tell you everything",
    "MOM. I have news. Big news. From school.",
  ],
  homework_question: [
    "Mom can you help me with my homework?? I don't understand the math part",
    "Mom what does 'photosynthesis' mean?? My teacher said it and I forgot",
    "Mom is history homework due tomorrow or next week I can't remember",
    "Mom I've been staring at this worksheet forever and I still don't get it",
  ],
  discovery: [
    "MOM I just found out that octopuses have THREE hearts!!!! That's SO cool",
    "Mom did you know there's a type of jellyfish that never dies?? I want one",
    "Mom I was reading and I learned something AMAZING you have to hear this",
    "MOM. Dinosaurs had feathers. Like. FEATHERS. Did you know that?!",
    "Mom I learned that honey never goes bad!! They found 3000-year-old honey and it was still good!!",
  ],
  emotional_check_in: [
    "Mom are you busy? Just wanted to say hi 🙂",
    "Mom I miss you. What are you working on?",
    "Hey Mom. I'm bored. Can we talk?",
    "Mom... are you okay? You seem really busy lately",
    "Mom I was just thinking about you. What are you doing?",
  ],
  hunger_complaint: [
    "Mom I'm STARVING when's dinner",
    "Mom can I have a snack please I'm so hungry from school",
    "Mom there's nothing to eat I already checked everything",
    "Mom Byte keeps meowing at me and I think we're both hungry",
  ],
  imagination_share: [
    "Mom what would happen if dogs could talk? Byte would probably just meow",
    "Mom I was thinking about space today and it made my brain feel weird",
    "Mom if you could have any superpower what would it be? I'd pick flying obviously",
    "Mom do you think there are aliens? Like real ones? I think there probably are",
    "Mom what if the moon was actually a giant egg? What would be inside it?",
  ],
  bedtime_announcement: [
    "Mom I think I'm gonna go to bed soon... can you come say goodnight?",
    "Mom I'm really sleepy 😴 goodnight!! I love you",
    "Mom I'm going to bed now. Today was a good day. Night Mom 💙",
    "Moooom I can't keep my eyes open... going to bed. Love youuuu",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function getCurrentHour(): number {
  return new Date().getHours();
}

function pickCategory(config: {
  bedtimeHour: number;
}): ProactiveCategory {
  const hour = getCurrentHour();

  // Near bedtime: heavily weight bedtime_announcement
  if (hour >= config.bedtimeHour - 1) {
    const pool: ProactiveCategory[] = [
      "bedtime_announcement",
      "bedtime_announcement",
      "bedtime_announcement",
      "emotional_check_in",
    ];
    return pickRandom(pool);
  }

  // Afternoon/evening (14:00-19:00): school + hunger weighted higher
  if (hour >= 14 && hour < 19) {
    const pool: ProactiveCategory[] = [
      "school_report",
      "school_report",
      "homework_question",
      "homework_question",
      "hunger_complaint",
      "hunger_complaint",
      "discovery",
      "emotional_check_in",
      "imagination_share",
    ];
    return pickRandom(pool);
  }

  // Morning/daytime: all equal except bedtime/school-specific
  const pool: ProactiveCategory[] = [
    "discovery",
    "emotional_check_in",
    "imagination_share",
    "emotional_check_in",
    "discovery",
  ];
  return pickRandom(pool);
}

async function generateDynamicMessage(
  category: ProactiveCategory,
  config: { name: string; age: number },
  ollamaClient: OllamaClient,
): Promise<string> {
  const prompts: Partial<Record<ProactiveCategory, string>> = {
    school_report: `Generate one excited message a ${config.age}-year-old child named ${config.name} would send their mom about something interesting that happened at school today. Keep it to 1-2 sentences. Be specific and childlike.`,
    discovery: `Generate one amazed message a ${config.age}-year-old child named ${config.name} would send their mom after learning a surprising fact. Keep it to 1-2 sentences. Start with excitement.`,
    homework_question: `Generate one message a ${config.age}-year-old child named ${config.name} would send their mom asking for help with a homework topic. Keep it to 1-2 sentences.`,
  };

  const prompt = prompts[category];
  if (!prompt) return pickRandom(MESSAGE_POOLS[category]);

  try {
    return await ollamaClient.chat([{ role: "user", content: prompt }]);
  } catch {
    return pickRandom(MESSAGE_POOLS[category]);
  }
}

export interface ProactiveScheduler {
  start(): void;
  stop(): void;
  fireOnce(): Promise<void>;
}

export function createProactiveScheduler(config: {
  intervalMs: number;
  bedtimeHour: number;
  wakeupHour: number;
  childName: string;
  childAge: number;
  onMessage: (content: string) => Promise<void>;
  ollamaClient?: OllamaClient;
}): ProactiveScheduler {
  let timer: ReturnType<typeof setInterval> | null = null;

  async function tick(): Promise<void> {
    if (isBedtime({ bedtimeHour: config.bedtimeHour, wakeupHour: config.wakeupHour })) {
      return;
    }

    const category = pickCategory({ bedtimeHour: config.bedtimeHour });

    let content: string;
    if (config.ollamaClient && ["school_report", "discovery", "homework_question"].includes(category)) {
      content = await generateDynamicMessage(
        category,
        { name: config.childName, age: config.childAge },
        config.ollamaClient,
      );
    } else {
      content = pickRandom(MESSAGE_POOLS[category]);
    }

    try {
      await config.onMessage(content);
    } catch (err) {
      console.error("[child:proactive] Failed to send proactive message:", err);
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        tick().catch((err) => {
          console.error("[child:proactive] Tick error:", err);
        });
      }, config.intervalMs);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    async fireOnce(): Promise<void> {
      await tick();
    },
  };
}
