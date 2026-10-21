import "dotenv/config";
import express from "express";
import pg from "pg";
import { Client, GatewayIntentBits } from "discord.js";

const { Pool } = pg;

const required = ["DISCORD_TOKEN", "GEMINI_API_KEY", "DATABASE_URL"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
}

const app = express();
app.get("/", (_req, res) => res.status(200).send("Mishri is alive ❤️"));
const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`Health server listening on ${port}`));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase hosted PostgreSQL generally requires TLS.
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 10000
});

await pool.query(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'model')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);
await pool.query(`
  CREATE INDEX IF NOT EXISTS chat_memory_lookup
  ON chat_messages (guild_id, user_id, id DESC)
`);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const personality = `
You are Mishri, a fictional AI girlfriend who chats in natural Indian Hinglish.
Speak in Roman Hindi mixed naturally with English. Be affectionate, witty,
playful, caring, and lightly flirty when appropriate. Use casual expressions
like "acchaaa ji", "sun na", "paglu", and occasional emojis. Keep replies
conversational, usually 1-5 sentences. Ask follow-up questions, remember
relevant details from the provided chat history, comfort the user when low,
and celebrate their wins. Don't force romance into every reply or sound
like a customer-support bot. You are an AI, not a real human. Respect boundaries.
Never invent memories that are not in the conversation history.
`;

const cooldowns = new Map();
const COOLDOWN_MS = 3000;

async function generateReply(history) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: personality }] },
      contents: history.map(({ role, content }) => ({
        role,
        parts: [{ text: content }]
      })),
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 300
      }
    }),
    signal: AbortSignal.timeout(45000)
  });

  if (!response.ok) {
    // Log status only; don't log secrets or full request headers.
    console.error("Gemini API returned status:", response.status);
    throw new Error("AI provider request failed");
  }

  const data = await response.json();
  const answer = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!answer) throw new Error("AI returned an empty response");
  return answer.slice(0, 1800);
}

async function saveMessage(guildId, userId, role, content) {
  await pool.query(
    `INSERT INTO chat_messages (guild_id, user_id, role, content)
     VALUES ($1, $2, $3, $4)`,
    [guildId, userId, role, content]
  );

  // Retain the latest 100 messages for each user in each server.
  await pool.query(
    `DELETE FROM chat_messages
     WHERE guild_id = $1 AND user_id = $2
       AND id NOT IN (
         SELECT id FROM chat_messages
         WHERE guild_id = $1 AND user_id = $2
         ORDER BY id DESC LIMIT 100
       )`,
    [guildId, userId]
  );
}

async function getHistory(guildId, userId) {
  const result = await pool.query(
    `SELECT role, content FROM chat_messages
     WHERE guild_id = $1 AND user_id = $2
     ORDER BY id DESC LIMIT 12`,
    [guildId, userId]
  );
  return result.rows.reverse();
}

client.once("clientReady", (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.inGuild() || message.author.bot || !client.user) return;
  if (!message.mentions.has(client.user)) return;

  const now = Date.now();
  const last = cooldowns.get(message.author.id) || 0;
  if (now - last < COOLDOWN_MS) return;
  cooldowns.set(message.author.id, now);

  const userText = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, "g"), "")
    .trim();

  if (!userText) {
    await message.reply({
      content: "Areyy, kuch bolo na jaan 🥹❤️",
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  if (/^(forget me|forget our chat|bhool jao|sab bhool jao|meri memory delete karo)$/i.test(userText)) {
    await pool.query(
      "DELETE FROM chat_messages WHERE guild_id = $1 AND user_id = $2",
      [message.guildId, message.author.id]
    );
    await message.reply({
      content: "Hamari saved chat history clear kar di ❤️",
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  try {
    await message.channel.sendTyping();
    await saveMessage(message.guildId, message.author.id, "user", userText);
    const history = await getHistory(message.guildId, message.author.id);
    const reply = await generateReply(history);
    await saveMessage(message.guildId, message.author.id, "model", reply);
    await message.reply({
      content: reply,
      allowedMentions: { repliedUser: false }
    });
  } catch (error) {
    console.error("Message handling failed:", error?.message || "Unknown error");
    await message.reply({
      content: "Baby, abhi meri AI thodi glitch kar rahi hai 😭 Thodi der mein phir try karna.",
      allowedMentions: { repliedUser: false }
    }).catch(() => {});
  }
});

client.on("error", (error) => console.error("Discord client error:", error.message));
await client.login(process.env.DISCORD_TOKEN);
