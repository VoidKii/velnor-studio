# VELNOR STUDIO

A dark, creator-focused workspace that turns a short-form video idea into a hook, script, titles, caption, hashtags, sound directions, and a DaVinci Resolve editing plan.

## Live app

**https://velnor-studio.onrender.com**

The live deployment currently runs in clearly labelled **demo mode**. Real AI is not enabled until a provider API key is added to Render's environment settings.

## Repository layout

The application source is in [`velnor-studio/`](velnor-studio/README.md). Render is configured through the root [`render.yaml`](render.yaml), which sets the app's root directory and runs the automated backend tests before starting the service.

## Security

Never commit API keys or a real `.env` file. Local secrets are excluded by `.gitignore`. If you enable an AI provider on the public service, also configure a strong `ACCESS_CODE` in Render before sharing the URL; otherwise visitors may use your provider credits.

## Local development

Install Node.js 20.12 or newer, open a terminal in `velnor-studio/`, and run `npm start`. Run `npm test` there to execute the backend tests.
