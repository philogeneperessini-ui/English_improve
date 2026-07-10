import { NextResponse } from "next/server";
import { z } from "zod";
import { extractJson } from "@/lib/evaluation";
import { protectApi } from "@/lib/api-protection";

const messageSchema = z.object({
  role: z.union([z.literal("user"), z.literal("assistant")]),
  content: z.string().trim().min(1).max(2_000),
});

const questionSchema = z.object({
  part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  topic: z.string(),
  prompt: z.string(),
});

const requestSchema = z.object({
  question: questionSchema,
  messages: z.array(messageSchema).min(1).max(20),
});

const responseSchema = z.object({
  reply: z.string().min(1).max(800),
  draft: z.string().min(1).max(2_000),
});

const partGuide: Record<number, string> = {
  1: "Part 1：4-5 句，简短自然，像闲聊。",
  2: "Part 2：8-12 句，有开头、展开细节和一个收尾，可适度加入感受。",
  3: "Part 3：5-6 句，要有观点 + 理由 + 举例或对比。",
};

function stripToPlainText(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  out = out.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1");
  const replyMatch = out.match(/"draft"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (replyMatch) return replyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
  return out.trim();
}

export async function POST(request: Request) {
  const blocked = protectApi(request, "coach", 60);
  if (blocked) return blocked;

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const { question, messages } = parsed.data;
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      reply: "演示模式无法使用 AI 辅助构思，请先配置 MiniMax 或选择「直接回答」。",
      draft: "",
      source: "demo" as const,
    });
  }

  const baseUrl = (process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1").replace(/\/$/, "");
  const model = process.env.MINIMAX_MODEL || "MiniMax-M2.7";
  const systemPrompt = `你是一位耐心的雅思口语教练，帮用户把中文想法打磨成自然地道的英文雅思回答。
题目：Part ${question.part} · ${question.topic} — ${question.prompt}
要求：
1. 用户会用中文说想表达的内容（要点、经历、例子）。你不要逐句翻译，而是把它重组为结构完整、自然地道的英文回答。
2. 每次都要给出当前完整版本的英文 draft（不是片段，是整段可朗读的范文）。
3. ${partGuide[question.part]}
4. 用词不要太高级，保持用户能学会、能自己说出来的水平；避免生僻词和过于书面的表达。
5. reply 用简短中文说明这一版你做了什么调整（例如"加了一个例子""把开头改得更自然"），不超过两句话。
6. 只返回 JSON，不要 Markdown 或思考过程：
{"reply":"简短中文说明","draft":"完整英文范文"}`;

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
        temperature: 0.6,
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

    try {
      const result = responseSchema.parse(extractJson(content));
      return NextResponse.json({ ...result, source: "minimax" });
    } catch {
      const draft = stripToPlainText(content).trim();
      if (draft.length < 5) {
        throw new Error(`MiniMax 返回内容无法解析。原始返回(前300字): ${content.slice(0, 300)}`);
      }
      return NextResponse.json({
        reply: "（模型未按格式返回，已提取英文内容作为范文）",
        draft,
        source: "minimax" as const,
      });
    }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({
      reply: `AI 辅助暂时不可用：${reason}`,
      draft: "",
      source: "demo" as const,
    });
  }
}
