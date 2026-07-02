import { NextResponse } from "next/server";
import { z } from "zod";
import { extractJson } from "@/lib/evaluation";
import { protectApi } from "@/lib/api-protection";

const messageSchema = z.object({
  role: z.union([z.literal("user"), z.literal("assistant")]),
  content: z.string().trim().min(1).max(2_000),
});

const requestSchema = z.object({
  scenario: z.union([
    z.literal("daily"),
    z.literal("travel"),
    z.literal("work"),
    z.literal("ideas"),
  ]),
  messages: z.array(messageSchema).min(1).max(20),
});

const responseSchema = z.object({
  reply: z.string().min(1).max(1_000),
  correction: z
    .object({
      original: z.string(),
      improved: z.string(),
      tip: z.string(),
    })
    .nullable(),
});

const scenarioPrompts = {
  daily: "轻松的日常闲聊，像友好的英语母语朋友",
  travel: "旅行情景对话，例如机场、酒店、餐厅和问路",
  work: "职场英语交流，例如会议、介绍项目和表达意见",
  ideas: "讨论观点和社会话题，训练解释、比较和举例",
};

function createDemoReply(scenario: keyof typeof scenarioPrompts, lastMessage: string) {
  const replies = {
    daily: `That sounds interesting. What do you enjoy most about it, and why?`,
    travel: `Great. Imagine you have just arrived in a new city. What would you like to do first?`,
    work: `Thanks for explaining that. How would you describe your main responsibility to a new colleague?`,
    ideas: `That's a useful point. Can you give me a specific example that supports your opinion?`,
  };

  const agreeError = /\bi am agree\b/i.test(lastMessage);
  return {
    reply: replies[scenario],
    correction: agreeError
      ? {
          original: "I am agree",
          improved: "I agree",
          tip: "agree 在这里是动词，前面不需要 am。",
        }
      : null,
    source: "demo" as const,
  };
}

export async function POST(request: Request) {
  const blocked = protectApi(request, "conversation", 60);
  if (blocked) return blocked;

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "对话内容格式不正确。" }, { status: 400 });
  }

  const { scenario, messages } = parsed.data;
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    return NextResponse.json(createDemoReply(scenario, latestUserMessage));
  }

  const baseUrl = (process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1").replace(/\/$/, "");
  const model = process.env.MINIMAX_MODEL || "MiniMax-M2.7";
  const systemPrompt = `你是一位耐心、自然的英语口语伙伴。当前场景：${scenarioPrompts[scenario]}。
规则：
1. 使用自然英文回复，控制在1到3句话、60个英文词以内。
2. 像真实对话一样回应用户内容，通常以一个相关问题继续交流。
3. 不要每句都纠错。只有存在明显且值得学习的错误时，提供一条简短纠正。
4. 不评价发音，因为你没有收到音频。
5. 只返回JSON对象，不要Markdown或思考过程：
{"reply":"English response","correction":null}
或
{"reply":"English response","correction":{"original":"用户的错误片段","improved":"更自然的英文","tip":"简短中文解释"}}`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.slice(-12),
        ],
        temperature: 0.65,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) throw new Error(`MiniMax request failed with ${response.status}`);
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const result = responseSchema.parse(extractJson(content));
    return NextResponse.json({ ...result, source: "minimax" });
  } catch {
    return NextResponse.json({
      ...createDemoReply(scenario, latestUserMessage),
      notice: "MiniMax 暂时不可用，本轮使用演示回复。",
    });
  }
}
