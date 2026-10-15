'use strict';

const PLATFORMS = ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Facebook Reels'];
const TONES = ['Cinematic', 'Energetic', 'Educational', 'Funny', 'Emotional', 'Mysterious', 'Professional'];
const LANGUAGES = ['English', 'Hindi', 'Nepali', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Indonesian', 'Japanese'];
const DURATIONS = [15, 30, 45, 60, 90];

class InputError extends Error {
  constructor(message) { super(message); this.name = 'InputError'; this.status = 400; }
}

function validateInput(body) {
  if (!body || typeof body !== 'object') throw new InputError('Send a JSON body.');
  const idea = typeof body.idea === 'string' ? body.idea.trim().replace(/\s+/g, ' ') : '';
  if (idea.length < 5) throw new InputError('Describe your video idea in at least a few words.');
  if (idea.length > 800) throw new InputError('Keep the idea under 800 characters.');
  const { platform, tone, language } = body;
  const duration = Number(body.duration);
  if (!PLATFORMS.includes(platform)) throw new InputError('Choose a valid platform.');
  if (!TONES.includes(tone)) throw new InputError('Choose a valid tone.');
  if (!LANGUAGES.includes(language)) throw new InputError('Choose a valid language.');
  if (!DURATIONS.includes(duration)) throw new InputError('Choose a valid duration.');
  let variant = Number.isInteger(body.variant) ? body.variant : 0;
  variant = Math.max(0, Math.min(variant, 1000));
  return { idea, platform, tone, language, duration, variant };
}

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const list = (v) => (Array.isArray(v) ? v : []);

/**
 * Coerce a pack (from the AI or the demo generator) into the exact shape the UI expects.
 * Throws an Error with code BAD_PACK when something essential is missing.
 */
function normalizePack(raw) {
  const bad = (msg) => { const e = new Error(msg); e.code = 'BAD_PACK'; return e; };
  if (!raw || typeof raw !== 'object') throw bad('The result was not an object.');

  const hook = str(raw.hook);
  if (!hook) throw bad('The result has no hook.');

  const script = list(raw.script).map((r) => ({
    time: str(r && r.time),
    visual: str(r && r.visual),
    voiceover: str(r && r.voiceover),
  })).filter((r) => r.time && (r.visual || r.voiceover));
  if (script.length < 3) throw bad('The result has too few script lines.');

  const titles = list(raw.titles).map(str).filter(Boolean).slice(0, 5);
  if (titles.length < 5) throw bad('The result has fewer than five titles.');

  const caption = str(raw.caption);
  if (!caption) throw bad('The result has no caption.');

  const hashtags = list(raw.hashtags).map(str).filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : '#' + h.replace(/\s+/g, '')))
    .filter((h) => h.length > 1).slice(0, 20);
  if (hashtags.length < 3) throw bad('The result has too few hashtags.');

  const music = list(raw.music).map(str).filter(Boolean).slice(0, 8);
  const sfx = list(raw.sfx).map((s) => ({ time: str(s && s.time), sound: str(s && s.sound) }))
    .filter((s) => s.sound).slice(0, 12);
  if (!music.length || !sfx.length) throw bad('The result has no music or sound suggestions.');

  const editing = list(raw.editing).map((s) => ({
    page: str(s && s.page), title: str(s && s.title), detail: str(s && s.detail),
  })).filter((s) => s.title && s.detail).slice(0, 14);
  if (editing.length < 4) throw bad('The result has too few editing steps.');

  return { hook, script, titles, caption, hashtags, music, sfx, editing };
}

module.exports = { PLATFORMS, TONES, LANGUAGES, DURATIONS, InputError, validateInput, normalizePack };
