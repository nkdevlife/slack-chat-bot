import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY!;

app.post("/slack/events", async (req: express.Request, res: express.Response): Promise<void> => {
  const { type, event } = req.body;

  // SlackのURL検証用
  if (type === "url_verification") {
    res.send({ challenge: req.body.challenge });
  }

  // メンション対応
  if (event?.type === "app_mention") {
    const text: string = event.text.toLowerCase();
    const prompt = text.replace(/<@[^>]+>\s*/,  "");

    let reply = "対応するAIが見つかりませんでした。";

    try {
      if (prompt.startsWith("/gpt")) {
        reply = await callGPT(prompt.replace("/gpt", "").trim());
      } else if (prompt.startsWith("/gemini")) {
        reply = await callGemini(prompt.replace("/gemini", "").trim());
      } else if (prompt.startsWith("/deepseek")) {
        reply = await callDeepSeek(prompt.replace("/deepseek", "").trim());
      }

      await axios.post(
        "https://slack.com/api/chat.postMessage",
        {
          channel: event.channel,
          text: reply,
        },
        {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error) {
      console.error("Error:", error);
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(200);
  }
});

async function callGPT(prompt: string): Promise<string> {
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  return res.data.choices[0].message.content;
}

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

  const response = await axios.post(
    url,
    {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  const candidates = response.data.candidates;
  if (!candidates || candidates.length === 0) {
    return "Geminiから応答がありませんでした。";
  }

  return candidates[0].content.parts[0].text;
}

async function callDeepSeek(prompt: string): Promise<string> {

  const response = await axios.post(
    "https://api.deepseek.com/v1/chat/completions",
    {
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const content = response.data.choices?.[0]?.message?.content;
  return content || "DeepSeekからの応答が得られませんでした。";
}
