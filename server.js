
import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getGeminiStream(ai, contents) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ai.models.generateContentStream({
        model: MODEL,
        contents,
        config: {
          systemInstruction:
            "You are Supreme AI, a smart, friendly, thoughtful AI assistant. Give accurate and useful answers. Explain uncertainty. Use Markdown when helpful. Provide complete code examples when practical."
        }
      });
    } catch (error) {
      const status = Number(error?.status || error?.statusCode || error?.code);
      const temporary =
        [429, 500, 503].includes(status) ||
        /UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(error.message || "");

      if (!temporary || attempt >= 3) throw error;

      const delay = 1000 * (2 ** attempt) + Math.random() * 500;
      console.log(`Gemini retry ${attempt + 1}/3 in ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: MODEL
  });
});

app.post("/api/chat", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "Gemini API key is missing."
    });
  }

  const messages = req.body?.messages;

  if (!Array.isArray(messages) || !messages.length || messages.length > 30) {
    return res.status(400).json({
      error: "Invalid conversation."
    });
  }

  const contents = messages
    .filter(m => m && ["user", "model"].includes(m.role) && typeof m.text === "string")
    .map(m => ({
      role: m.role,
      parts: [{ text: m.text.trim().slice(0, 12000) }]
    }))
    .filter(m => m.parts[0].text);

  if (!contents.length || contents.at(-1).role !== "user") {
    return res.status(400).json({
      error: "Your latest message must be a user message."
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    const stream = await getGeminiStream(ai, contents);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    for await (const chunk of stream) {
      const text = chunk.text || "";
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (error) {
    console.error("Gemini request failed:", error);

    const status = Number(error?.status || error?.statusCode || error?.code);

    if (!res.headersSent) {
      if (status === 503 || /UNAVAILABLE|high demand/i.test(error.message || "")) {
        return res.status(503).json({
          error: "Google Gemini is temporarily busy. Supreme AI tried several times, but Google is still unavailable. Please try again shortly."
        });
      }

      return res.status(500).json({
        error: "Supreme AI couldn't get a response from Gemini. Check the Render logs."
      });
    }

    res.write(`data: ${JSON.stringify({
      error: "The response was interrupted. Please try again."
    })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Supreme AI running on port ${PORT} using ${MODEL}`);
});
