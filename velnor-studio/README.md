# VELNOR STUDIO

A creator-pack generator for short-form video. Type an idea, pick platform, tone, language and duration, and get:

- an opening hook
- a timestamped script (with a timeline strip)
- five title options
- caption and hashtags
- music and sound-effect suggestions
- a step-by-step DaVinci Resolve editing blueprint

Everything is editable, every section has a copy button, there is a Copy all button, Regenerate, saved projects, searchable history, and loading / empty / error states.

It has **zero dependencies**. No `npm install`, no database, no build step. It is a small Node.js server plus plain HTML, CSS and JavaScript. It is separate from any other project: its own folder, its own keys, its own storage.

## Two modes

| Mode | When | What you get |
|---|---|---|
| **Demo mode** | No API key set (default) | Hand-written templates filled with your idea. **Not AI.** English only. Clearly labeled in the app. |
| **AI mode** | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set on the server | Real AI-written packs in the language you pick. |

API keys live only on the server (in `.env` or your host's environment settings). The browser never sees them.

## Run it on your computer

1. Install **Node.js** (the LTS version, 20.12 or newer): https://nodejs.org
2. Open a terminal in this folder.
3. Run:
   ```
   npm start
   ```
4. Open http://localhost:3000

That's it. You will see "Demo mode" in the top corner.

### Turn on real AI

1. Make a copy of `.env.example` and name it `.env`.
2. Get an API key and paste it after the matching `=`:
   - Anthropic: https://console.anthropic.com (`ANTHROPIC_API_KEY`)
   - OpenAI: https://platform.openai.com (`OPENAI_API_KEY`)
3. Stop the server (Ctrl+C) and run `npm start` again. The badge changes to "AI mode".

API usage is **billed by the provider**, and free credits are not guaranteed. Set a monthly spending limit in the provider's dashboard.

The default models are `claude-sonnet-5-5` and `gpt-4o-mini`. Change them with `ANTHROPIC_MODEL` / `OPENAI_MODEL` in `.env` if your account uses different ones.

## Deploy for free (Render)

Render can run this as a free web service. Free tiers change, so check Render's current terms. At the time of writing, free web services go to sleep after a period of no traffic, so the first visit after a pause can take up to a minute.

1. Create a free GitHub account and a **new, empty repository**. Upload this folder's files to it. Do **not** upload `.env` (the `.gitignore` already excludes it).
2. Create a free account at https://render.com and choose **New > Web Service**, then connect your GitHub repo.
3. Use these settings:
   - Runtime: **Node**
   - Build command: `echo ok` (nothing to build)
   - Start command: `node server.js`
   - Instance type: **Free**
4. Under **Environment**, add variables:
   - `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) if you want AI mode. Leave both out to stay in demo mode.
   - `ACCESS_CODE` with any passphrase **if you set an AI key**. Without it, anyone who finds your URL can spend your API credits. With it, visitors must type the code in the app first.
5. Click **Create Web Service**. When it finishes, open the `onrender.com` link.

A `render.yaml` is included if you prefer Render's Blueprint flow. I could not test deploying it.

Vercel and Netlify are not drop-in for this project because it uses a long-running Node server, not serverless functions.

## Where your data lives

Saved projects, history and your last-used form choices are stored in your **browser's localStorage**. That means:

- there are no accounts and nothing is stored on the server
- they do not sync between devices or browsers
- clearing site data erases them (history keeps the latest 40 packs)

## Safety built in

- Keys are read only on the server; `/api/status` reports the mode and model name, never the key.
- Optional `ACCESS_CODE`; per-IP rate limit (12 generations per minute).
- Input validation, 20 KB request limit, strict Content-Security-Policy, path-traversal protection.
- Your idea is treated as content for the AI, with an instruction to ignore anything in it that tries to change the output format.

## Tests

```
npm test
```

Runs 12 backend tests (validation, demo generator, endpoints, access code, rate limit, static file safety). The AI code path is tested against a **local mock** of the provider's API, which checks request shape, auth headers and error handling. It does **not** prove the real Anthropic or OpenAI APIs accept the request. Your first real call will.

An optional browser test lives in `e2e/ui_test.py` (needs Python and Playwright).

## Project layout

```
server.js          HTTP server, API routes, static files
lib/schema.js      Input validation and result validation
lib/demo.js        Demo-mode template generator (not AI)
lib/ai.js          Anthropic / OpenAI calls (server side only)
public/            index.html, styles.css, app.js (the whole UI)
test/              backend tests
e2e/               optional browser test
```

## Known limits

- Demo mode is English only and obviously template-based.
- The DaVinci Resolve steps are practical defaults. Menu names and some features (for example auto-subtitles, which can be Studio-only) vary by version, so check against your install.
- Regenerate replaces the whole pack, not a single section.
