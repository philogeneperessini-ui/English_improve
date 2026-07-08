import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createDemoEvaluation,
  evaluationSchema,
  extractJson,
} from "@/lib/evaluation";
import { protectApi } from "@/lib/api-protection";

const requestSchema = z.object({
  transcript: z.string().trim().min(3).max(12_000),
  durationSeconds: z.number().min(0).max(600),
  metrics: z
    .object({
      wordCount: z.number().min(0),
      wordsPerMinute: z.number().min(0),
      lexicalDiversity: z.number().min(0).max(1),
      fillerCount: z.number().min(0),
      repetitionCount: z.number().min(0),
      pauseCount: z.number().min(0),
      averagePauseMs: z.number().min(0),
      longestPauseMs: z.number().min(0),
    })
    .optional(),
  question: z.object({
    id: z.string(),
    part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    topic: z.string(),
    prompt: z.string(),
    cuePoints: z.array(z.string()).optional(),
    prepSeconds: z.number(),
    answerSeconds: z.number(),
  }),
});

export async function POST(request: Request) {
  const blocked = protectApi(request, "evaluate", 30);
  if (blocked) return blocked;

  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "回答内容太短或请求格式不正确。" },
      { status: 400 },
    );
  }

  const { transcript, question, durationSeconds, metrics } = parsed.data;
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      createDemoEvaluation(transcript, question, durationSeconds, metrics),
    );
  }

  const baseUrl = (process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1").replace(/\/$/, "");
  const model = process.env.MINIMAX_MODEL || "MiniMax-M2.7";
  const systemPrompt = `你是一位严谨、鼓励型的英语口语教练。根据用户的题目与转写文本进行反馈。
只评价能从文本观察到的内容，绝不根据文字猜测发音。评分采用0到9分、0.5分步进。
必须只返回一个JSON对象，不要Markdown，不要思考过程。JSON结构：
{"overall":6.5,"summary":"中文总结","scores":{"fluency":6.5,"vocabulary":6,"grammar":6,"relevance":7},"pronunciation":{"score":null,"note":"尚未提供音频级发音评分"},"strengths":["..."],"improvements":[{"title":"...","evidence":"引用原回答中的短语","suggestion":"可执行建议"}],"improvedAnswer":"保持用户原意的英文优化答案","nextFocus":"一句中文练习目标"}
规则：strengths 1-3项；improvements 2-3项；不要声称这是官方雅思成绩；改写答案长度与原回答接近。`;

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
          {
            role: "user",
            content: `IELTS Part ${question.part}\nQuestion: ${question.prompt}\nDuration: ${durationSeconds}s\nObservable speech metrics (do not treat them as pronunciation evidence):\n${JSON.stringify(metrics ?? {})}\nTranscript:\n${transcript}`,
          },
        ],
        temperature: 0.2,
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
    const evaluation = evaluationSchema.parse(extractJson(content));

    return NextResponse.json({ ...evaluation, source: "minimax" });
  } catch (error) {
    const notice = error instanceof Error ? error.message : "MiniMax 调用失败";
    return NextResponse.json(
      createDemoEvaluation(transcript, question, durationSeconds, metrics, `已使用本地演示评价：${notice}`),
    );
  }
}
