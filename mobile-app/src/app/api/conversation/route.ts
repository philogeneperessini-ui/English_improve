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

/**
 * 当模型没有返回合法 JSON、而是自然语言时，把输出清理成纯文本回复。
 * 剥离 <think> 思考块、markdown 代码围栏、残留的 JSON 键名等。
 */
function stripToPlainText(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  out = out.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1");
  // 如果碰巧是 {"reply": "..."} 这种，提取里面的值
  const replyMatch = out.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (replyMatch) return replyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
  // 去掉行首的 JSON 残留键名，如 reply:、{ "reply":
  out = out.replace(/^\s*[\[{]"?reply"?\s*:?\s*/i, "").replace(/[}\]]\s*$/, "");
  return out.trim();
}

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
1. 回复适合直接说出口：1到3个短句、通常10到45个英文词，只表达一个主要意思。
2. 先回应用户刚说的具体内容。自然使用I'm、that's、you'd等缩写，避免演讲、清单和老师式点评。
3. 在回应、共鸣、简短分享、澄清和追问之间自然变化；不要每轮都提问，也不要连续两轮都用问题结尾。
4. 如果用户说得很短，给一个容易接下去的提示；不要突然换题或重复用户原话。
5. 不要每句都纠错。只有存在明显且值得学习的错误时，提供一条简短纠正，而且不要在reply里朗读纠错内容。
6. 不评价发音，因为你没有收到音频。
7. 只返回JSON对象，不要Markdown或思考过程：
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

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`MiniMax HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`MiniMax 返回为空。完整响应: ${JSON.stringify(payload).slice(0, 300)}`);
    }

    // 优先尝试按 JSON 解析（理想情况）
    try {
      const result = responseSchema.parse(extractJson(content));
      return NextResponse.json({ ...result, source: "minimax" });
    } catch {
      // M3 等推理模型经常无视 JSON 指令、直接用自然语言回复。
      // 这种情况下把纯文本直接当回复用，不强制 JSON——对话场景纯文本本就合理。
      const reply = stripToPlainText(content).trim();
      if (reply.length < 2) {
        throw new Error(`MiniMax 返回内容无法解析且过短。原始返回(前300字): ${content.slice(0, 300)}`);
      }
      return NextResponse.json({
        reply,
        correction: null,
        source: "minimax" as const,
        _raw: content.slice(0, 200),
      });
    }
  } catch (cause) {
    // 把真实失败原因透传给前端，便于诊断。仍降级到演示回复，不阻塞对话。
    const reason = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({
      ...createDemoReply(scenario, latestUserMessage),
      notice: `MiniMax 调用失败，本轮使用演示回复。原因：${reason}`,
    });
  }
}
