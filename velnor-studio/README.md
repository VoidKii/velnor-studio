# VELNOR STUDIO

A creator-pack generator for short-form video. Enter an idea, choose a platform, tone, language and duration, then generate:

- An opening hook and timestamped script
- Five title options, a caption and hashtags
- Music and sound-effect directions
- A practical DaVinci Resolve editing blueprint

The interface includes editable output sections, per-section copy, Copy all, regenerate, saved projects and searchable local history.

## Modes

- **Demo mode:** default when no provider key is configured. Uses clearly labelled templates, not AI, and is English-only.
- **AI mode:** configure an Anthropic or OpenAI API key in the server environment. AI requests run on the server; keys are never sent to the browser.

Provider API usage can cost money. Set a provider spending limit and never commit a real key to GitHub.

## Run locally

Requires Node.js 20.12 or newer.

From this folder:

```sh
npm start
```

Open http://localhost:3000. There are no third-party npm dependencies.

To configure a provider, copy `.env.example` to `.env`, fill in one provider key, and restart the server. `.env` is excluded by `.gitignore`.

Supported environment variables:
- `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL`
- `OPENAI_API_KEY` and optional `OPENAI_MODEL`
- `AI_PROVIDER=anthropic` or `AI_PROVIDER=openai` to force a configured provider
- `ACCESS_CODE` to protect generation on a public deployment when an API key is configured

The defaults are `claude-sonnet-4-5` and `gpt-4o-mini`. Provider model availability can vary by account; change the model environment variable if needed.

## Deploy to Render

A Blueprint is included at the **repository root** in `/render.yaml`. It sets Render's Root Directory to `velnor-studio`, runs `npm test` during build, and starts the app with `npm start`. The default deployment has no AI keys configured, so it starts safely in demo mode.

Alternatively create a Node web service for this repository with:
- Root Directory: `velnor-studio`
- Build Command: `npm test`
- Start Command: `npm start`
- Health Check Path: `/api/status`

To enable AI after deployment, add the provider key in Render's Environment settings. **If you add a provider key to a public service, also set a strong `ACCESS_CODE`** so random visitors cannot spend your API credits. Do not put secrets in the Blueprint or source files.

Render's free services may sleep while idle, so the first request after a pause can take a little longer. Plan availability and terms can change.

## Data and privacy

Projects, history and form choices are stored in the browser's localStorage. There are no user accounts or server-side project database, and saved items do not sync between browsers or devices.

## Security features

- Provider keys remain server-side
- Optional access-code gate and per-IP generation rate limit
- Request validation and body-size limit
- Content Security Policy and other security headers
- Static-file path traversal protection

## Tests

```sh
npm test
```

The backend tests include validation, demo generation, API endpoints, access-code behavior, rate limits and static-file safety. Provider integration tests use local mocks; they do not prove that a real API key/model works. A live provider call should be verified only after configuring a key.

An optional browser test is in `e2e/ui_test.py` and requires Python plus Playwright.

## Layout

```
render.yaml           Render Blueprint (repository root)
velnor-studio/
  server.js           Node HTTP server and API routes
  lib/                validation, demo generator and AI providers
  public/             HTML, CSS and browser JavaScript
  test/               backend tests
  e2e/                optional browser test
  .env.example        safe environment-variable template
  .gitignore          excludes local secrets
``

## Current limitations

- Demo mode is template-based and English-only.
- Saved projects are browser-local; no accounts or cloud sync.
- Regenerate replaces the full creator pack.
- AI API calls have not been verified against a live provider from this repository.
