# Mishri Discord AI Girlfriend Bot

A Discord bot that replies in Hinglish when mentioned. Uses Gemini for responses and Supabase PostgreSQL for conversation history.

## Files
- `index.js`: bot and health endpoint
- `package.json`: dependencies and start command
- `.gitignore`: excludes secrets and dependencies
- `.env.example`: safe placeholder template only

## Required environment variables
Set these in your hosting provider's Environment settings:
- `DISCORD_TOKEN`
- `GEMINI_API_KEY`
- `DATABASE_URL`
- Optional: `GEMINI_MODEL` (defaults to `gemini-2.5-flash`)
- Optional: `PORT` (hosting providers often set this automatically)

Do not commit a real `.env` file or share tokens publicly.

## Deploy to Render
1. Push these files to a private GitHub repository.
2. Create a Render Web Service connected to that repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Choose Node 20+ and add the environment variables in Render's dashboard.
6. Check the logs for `Logged in as ...`; visit the service URL to check its health endpoint.

Free hosting may sleep or have usage limits; continuous 24/7 uptime is not guaranteed.

## Discord setup
Create an application in the Discord Developer Portal, add a bot, and invite it with the `bot` scope and only the required permissions. Enable Message Content Intent in the bot settings if using the current code.

## Memory and privacy
The bot stores recent messages by server and user ID in PostgreSQL. It retains up to 100 messages per user per server. Users can ask it to clear their history using `@Mishri forget our chat`. Inform server members before enabling the bot in a shared server.
