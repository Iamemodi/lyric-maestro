import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  audioBase64: z.string().min(10),
  audioMime: z.string().default("audio/mpeg"),
  lines: z.array(z.string()).min(1).max(400),
});

export const aiSyncLines = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const numbered = data.lines.map((t, i) => `${i}: ${t}`).join("\n");

    const body = {
      model: "google/gemini-2.5-pro",
      messages: [
        {
          role: "system",
          content:
            "You are an expert audio transcription/alignment engine. The user provides an audio file and a list of lyric lines (in order). For each line, return the precise start time in seconds (float, relative to the start of the audio) when the FIRST word of that line begins being sung. Use null when a line is clearly not present. Times must be monotonically non-decreasing.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Lyrics (one per line, with index):\n${numbered}\n\nReturn alignment via the tool.`,
            },
            {
              type: "input_audio",
              input_audio: { data: data.audioBase64, format: data.audioMime.split("/")[1] || "mp3" },
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_alignment",
            description: "Submit start time per lyric line index.",
            parameters: {
              type: "object",
              properties: {
                alignment: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: { type: "number" },
                      startSeconds: { type: ["number", "null"] },
                    },
                    required: ["index", "startSeconds"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["alignment"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_alignment" } },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      if (resp.status === 429) throw new Error("Rate limited. Please retry shortly.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
      throw new Error(`AI gateway error ${resp.status}: ${txt.slice(0, 200)}`);
    }

    const json = await resp.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) throw new Error("AI did not return alignment.");
    const parsed = JSON.parse(argsStr) as {
      alignment: { index: number; startSeconds: number | null }[];
    };
    return { alignment: parsed.alignment };
  });

const WordsInputSchema = z.object({
  audioBase64: z.string().min(10),
  audioMime: z.string().default("audio/mpeg"),
  lines: z
    .array(
      z.object({
        index: z.number().int(),
        text: z.string(),
        startSeconds: z.number(),
        endSeconds: z.number(),
      }),
    )
    .min(1)
    .max(200),
});

export const aiSyncWords = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => WordsInputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const linesText = data.lines
      .map(
        (l) =>
          `${l.index} [${l.startSeconds.toFixed(2)}s–${l.endSeconds.toFixed(2)}s]: ${l.text}`,
      )
      .join("\n");

    const body = {
      model: "google/gemini-2.5-pro",
      messages: [
        {
          role: "system",
          content:
            "You are an expert audio alignment engine. For each lyric line you receive, return per-word offsets in MILLISECONDS relative to that line's startSeconds. The first word should be 0 or near it. Word offsets must be monotonically non-decreasing and not exceed (endSeconds - startSeconds) * 1000.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Lines (with index, time window, text):\n${linesText}\n\nReturn alignment via the tool. Provide exactly one entry per input line.`,
            },
            {
              type: "input_audio",
              input_audio: { data: data.audioBase64, format: data.audioMime.split("/")[1] || "mp3" },
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_word_alignment",
            description: "Submit per-word offsets in ms for each lyric line.",
            parameters: {
              type: "object",
              properties: {
                lines: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      lineIndex: { type: "number" },
                      wordOffsetsMs: { type: "array", items: { type: "number" } },
                    },
                    required: ["lineIndex", "wordOffsetsMs"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["lines"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_word_alignment" } },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      if (resp.status === 429) throw new Error("Rate limited. Please retry shortly.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
      throw new Error(`AI gateway error ${resp.status}: ${txt.slice(0, 200)}`);
    }

    const json = await resp.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) throw new Error("AI did not return word alignment.");
    const parsed = JSON.parse(argsStr) as {
      lines: { lineIndex: number; wordOffsetsMs: number[] }[];
    };
    return { lines: parsed.lines };
  });
