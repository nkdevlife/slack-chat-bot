import express from "express";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(
  express.json({
    verify: (req, res, buf) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).rawBody = buf.toString("utf8");
    }
  })
);

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
  const isValid = verifySlackSignature({
    timestamp: req.headers["x-slack-request-timestamp"] as string,
    signature: req.headers["x-slack-signature"] as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawBody: (req as any).rawBody,
    slackSigningSecret: process.env.SLACK_SIGNING_SECRET!,
  });

  if (!isValid) {
    res.status(403).send("Invalid signature");
    return;
  }
  const { type, event, challenge } = req.body;

  // SlackのURL検証
  if (type === "url_verification") {
    res.send({ challenge });
    return;
  }

  res.sendStatus(200);

  // メンションに対応
  if (event?.type === "app_mention") {
    const text = event.text.replace(/<@[^>]+>\s*/, "").trim();

    try {
      const reply = await callGemini(text);

      // 応答をSlackに送信
      const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
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
      const slackData = await slackRes.json();
      if (!slackData.ok) {
        console.error("Slack API error:", slackData);
      }
    } catch (err) {
      console.error("Gemini API error:", err);
    }
  }
});

/**
 * Slackからのリクエストの署名を検証する関数
 *
 * リクエストが有効であり、リプレイ攻撃でないことを確認する
 *
 * @param params 検証に必要なパラメータ
 * @param params.timestamp リクエストのタイムスタンプ（秒単位）
 * @param params.signature リクエストの署名
 * @param params.rawBody リクエストの生のボディ（文字列）
 * @param params.slackSigningSecret Slackの署名検証に使用するシークレットキー
 * @returns 署名が有効であれば `true`、無効であれば `false`
 */
function verifySlackSignature({
  timestamp,
  signature,
  rawBody,
  slackSigningSecret,
}: {
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string;
  slackSigningSecret: string;
}): boolean {
  // timestampやsignatureがなければNG
  if (!timestamp || !signature) {
    return false;
  }

  // 現在時刻（秒単位）
  const time = Math.floor(Date.now() / 1000);

  // リプレイ攻撃防止のため、5分以上前/先のリクエストは除外
  if (Math.abs(time - Number.parseInt(timestamp, 10)) > 60 * 5) {
    return false;
  }

  // 署名作成用の文字列
  const sigBasestring = `v0:${timestamp}:${rawBody}`;

  // 自分側の署名（v0=...）を作成
  const mySignature = `v0=${crypto
    .createHmac("sha256", slackSigningSecret)
    .update(sigBasestring, "utf8")
    .digest("hex")}`;

  try {
    // timingSafeEqualで比較（タイミング攻撃対策）
    return crypto.timingSafeEqual(
      Buffer.from(mySignature, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    // 万が一エラーが出た場合も安全にfalseを返しておく
    return false;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook-based Slack Bot is listening on port ${PORT}`);
});