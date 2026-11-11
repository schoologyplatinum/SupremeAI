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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, configured: Boolean(process.env.GEMINI_API_KEY) });
});

app.post("/api/chat", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: "The Gemini API key has not been configured on the server yet." });
  }

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
    return res.status(400).json({ error: "Please send between 1 and 30 conversation messages." });
  }

  const contents = [];
  for (const message of messages) {
    if (!message || !["user", "model"].includes(message.role) || typeof message.text !== "string") continue;
    const text = message.text.trim().slice(0, 12000);
    if (text) contents.push({ role: message.role, parts: [{ text }] });
  }

  if (!contents.length || contents[contents.length - 1].role !== "user") {
    return res.status(400).json({ error: "Your latest message must be a user message." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents,
      config: {
        systemInstruction: `You are Supreme AI, a capable, thoughtful, friendly general-purpose AI assistant. Give accurate, useful answers. Be clear about uncertainty and never pretend to have performed actions you cannot perform. Use Markdown when it improves readability. For code, provide complete, runnable examples when practical.`
      }
    });

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    for await (const chunk of stream) {
      const text = chunk.text || "";
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Gemini request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Supreme AI couldn't get a response from Gemini. Check your API key, model access, and usage limits." });
    } else {
      res.write(`data: ${JSON.stringify({ error: "The response was interrupted. Please try again." })}\n\n`);
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Supreme AI is running on port ${PORT}`);
});
