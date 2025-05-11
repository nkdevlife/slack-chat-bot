import pkg from "@slack/bolt";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const { App } = pkg;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

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

app.event("app_mention", async ({ event, say }) => {
  console.log("event", JSON.stringify(event));
  const text = event.text.replace(/<@[^>]+>\s*/, "").trim();

  try {
    const response = await callGemini(text);
    await say(response);
  } catch (err) {
    console.error("Gemini API error:", err);
    await say("Geminiとの通信でエラーが発生しました。");
  }
});

(async () => {
  await app.start();
  console.log("⚡️ Gemini-only Slack Bot is running!");
})();
