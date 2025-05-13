import express from "express";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_SYSTEM_INSTRUCTION = process.env.GEMINI_SYSTEM_INSTRUCTION!;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function callGemini(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      systemInstruction: GEMINI_SYSTEM_INSTRUCTION
    },
  });
  console.log(response.text);
  return response.text ?? "";
}

// Slackからのイベント受信エンドポイント
app.post("/slack/events", async (req, res): Promise<void>  => {
  console.log("Headers:", JSON.stringify(req.headers));
  console.log("Body:", JSON.stringify(req.body));
  const { type, event, challenge } = req.body;

  // SlackのURL検証
  if (type === "url_verification") {
    res.send({ challenge });
    return;
  }

  // メンションに対応
  if (event?.type === "app_mention") {
    const text = event.text.replace(/<@[^>]+>\s*/, "").trim();

    try {
      const reply = await callGemini(text);

      // 応答をSlackに送信
      await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: event.channel,
          text: reply,
        }),
      });
    } catch (err) {
      console.error("Gemini API error:", err);
    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook-based Slack Bot is listening on port ${PORT}`);
});