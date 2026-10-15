'use strict';
/**
 * DEMO MODE generator.
 * This is NOT AI. It fills hand-written templates using the user's idea, tone,
 * platform and duration so the whole app can be tried without any API key.
 * Output is English only, whatever language was chosen.
 */

const { normalizePack } = require('./schema');

// ---------- helpers ----------
function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const STOP = new Set(('a an and are as at be but by for from has have how i if in into is it its just my of on or our so that the their ' +
  'them then there these they this to us was we what when where which who why will with you your about make made video short ' +
  'idea want need like get got can could should would do does did not no yes').split(' '));

function keywords(idea) {
  const words = idea.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const w of words) {
    if (w.length < 3 || STOP.has(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
  }
  return out.sort((a, b) => b.length - a.length).slice(0, 4);
}
function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : max).replace(/[,;:\-–—]+$/, '') + '…';
}
const stripEnd = (s) => s.replace(/[.!?…\s]+$/, '');
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---------- tone content ----------
const HOOKS = {
  Cinematic: [
    'Every great story starts with one quiet moment. This one is about {idea}.',
    'In the next {d} seconds, {idea} will look different to you.',
    'Imagine the camera pulling back, and you finally see the whole picture of {idea}.',
  ],
  Energetic: [
    'Stop scrolling. {idea}, and here is why it matters right now.',
    'You are about to see {idea} in a way you did not expect. Ready?',
    'Three, two, one. {idea}. Let us go.',
  ],
  Educational: [
    'Here is the part about {idea} that almost nobody explains clearly.',
    'Most people get {idea} wrong. Here is the simple version that actually works.',
    'If you only learn one thing today, learn this about {idea}.',
  ],
  Funny: [
    'I tried {idea}, and I regret nothing. Mostly.',
    'Nobody warned me about {idea}. So I am warning you.',
    'Let me tell you about {idea}, because apparently I like making things complicated.',
  ],
  Emotional: [
    'Some things stay with you. {idea} is one of them.',
    'I did not expect {idea} to hit this hard.',
    'If you have ever felt this way about {idea}, this one is for you.',
  ],
  Mysterious: [
    'What if everything you think you know about {idea} is only half the story?',
    'There is something hidden inside {idea}, and almost nobody notices it.',
    'It looks ordinary at first. Then you look closer at {idea}.',
  ],
  Professional: [
    'Here is a clear, practical look at {idea}, in under {d} seconds.',
    'If {idea} is on your radar, these are the three points that matter.',
    'A short briefing on {idea}: what it is, why it matters, what to do next.',
  ],
};

const TITLES = [
  '{Topic}: the part nobody explains',
  'Wait, {topic}? Here is the real story',
  'Watch this before you scroll on: {topic}',
  'The honest truth: {topic}',
  '{Topic} in {d} seconds',
  'You will not see this the same way again: {topic}',
  'Nobody talks about this: {topic}',
  'I finally understood it: {topic}',
  'Quick answer: {topic}',
  'This changes everything: {topic}',
];

const MUSIC = {
  Cinematic: ['Slow, wide orchestral pad with soft piano, about 70 to 80 BPM', 'Low sub-bass swell that builds under the hook, then opens up at the payoff', 'Search royalty-free libraries for: "cinematic ambient trailer", "emotional strings minimal"'],
  Energetic: ['Punchy electronic or trap beat, about 120 to 140 BPM, with a clear drop', 'Short build-up riser leading into the first cut', 'Search royalty-free libraries for: "upbeat social media", "hype drop short"'],
  Educational: ['Light, steady lo-fi or soft electronic bed, about 90 to 100 BPM, kept low under the voice', 'Subtle pluck or marimba accents on key points', 'Search royalty-free libraries for: "corporate light", "curious thinking underscore"'],
  Funny: ['Quirky pizzicato or bouncy ukulele loop, about 100 to 115 BPM', 'One short comedic sting for the punchline', 'Search royalty-free libraries for: "comedy quirky", "playful pizzicato"'],
  Emotional: ['Solo piano or warm acoustic guitar, about 60 to 75 BPM', 'Gentle string swell for the final line', 'Search royalty-free libraries for: "emotional piano", "heartfelt ambient"'],
  Mysterious: ['Dark ambient drone with sparse, reverbed percussion, about 70 BPM', 'Reversed cymbal or glassy texture before the reveal', 'Search royalty-free libraries for: "dark ambient suspense", "mystery underscore"'],
  Professional: ['Clean, modern minimal beat, about 100 to 110 BPM, quiet and unobtrusive', 'Simple synth pad that stays out of the voice frequencies', 'Search royalty-free libraries for: "modern corporate minimal", "confident tech background"'],
};

const PLATFORM_TAGS = {
  'TikTok': ['#fyp', '#tiktok', '#learnontiktok'],
  'Instagram Reels': ['#reels', '#instagramreels', '#explore'],
  'YouTube Shorts': ['#shorts', '#youtubeshorts', '#viral'],
  'Facebook Reels': ['#facebookreels', '#reels', '#trending'],
};

const CTA = {
  'TikTok': 'Follow for the next part, and tell me in the comments what to cover next.',
  'Instagram Reels': 'Save this for later and send it to someone who needs it.',
  'YouTube Shorts': 'Subscribe for more, and tell me in the comments what to cover next.',
  'Facebook Reels': 'Share this with a friend and follow for more.',
};

// ---------- script beats ----------
function beatPlan(d) {
  // fractions of total duration; last beat is the call to action.
  if (d <= 15) return [['Hook', 0.2], ['Point', 0.5], ['Payoff', 0.2], ['CTA', 0.1]];
  if (d <= 30) return [['Hook', 0.1], ['Setup', 0.2], ['Point', 0.35], ['Payoff', 0.25], ['CTA', 0.1]];
  if (d <= 45) return [['Hook', 0.08], ['Setup', 0.17], ['Point', 0.25], ['Point', 0.25], ['Payoff', 0.15], ['CTA', 0.1]];
  if (d <= 60) return [['Hook', 0.06], ['Setup', 0.14], ['Point', 0.22], ['Point', 0.22], ['Point', 0.14], ['Payoff', 0.12], ['CTA', 0.1]];
  return [['Hook', 0.05], ['Setup', 0.12], ['Point', 0.18], ['Point', 0.18], ['Point', 0.17], ['Point', 0.1], ['Payoff', 0.12], ['CTA', 0.08]];
}

function buildScript(input, hookLine, pick) {
  const { duration: d, tone, platform } = input;
  const plan = beatPlan(d);
  const ideaText = stripEnd(input.idea);
  const ideaShort = clip(ideaText, 70);
  let cursor = 0;
  let pointNo = 0;
  const rows = [];
  plan.forEach(([kind, frac], i) => {
    const isLast = i === plan.length - 1;
    const len = isLast ? d - cursor : Math.max(2, Math.round(d * frac));
    const start = cursor;
    const end = Math.min(d, isLast ? d : cursor + len);
    cursor = end;
    const time = `${mmss(start)}-${mmss(end)}`;
    let visual = '';
    let voiceover = '';
    if (kind === 'Hook') {
      visual = pick([
        'Tight close-up on the subject, immediate motion, big on-screen text with the hook line.',
        'Start mid-action, no intro or logo. Punch-in on the first word.',
        'Strong still or striking shot, quick push-in, text slams onto screen.',
      ]);
      voiceover = hookLine;
    } else if (kind === 'Setup') {
      visual = pick([
        'Wider establishing shot, then cut to two quick details that explain the situation.',
        'B-roll that shows the context while the voice sets up the stakes.',
      ]);
      voiceover = pick([
        `Here is the situation: ${ideaShort}. And it matters more than it seems.`,
        `Let me set the scene. ${ideaShort}. Stay with me for a moment.`,
      ]);
    } else if (kind === 'Point') {
      pointNo += 1;
      visual = pick([
        'Cut on action to a new angle. Add a short text label for the key word of this point.',
        'Screen recording, prop, or close-up that proves the point visually, one idea per shot.',
        'Fast B-roll sequence, a cut every one to two seconds, with a subtle zoom.',
      ]);
      voiceover = `Point ${pointNo}: [say the single most useful or surprising thing about "${clip(ideaShort, 40)}" here, in one or two short sentences].`;
    } else if (kind === 'Payoff') {
      visual = pick([
        'Hold the best shot slightly longer. Music drops out for a beat, then returns.',
        'Return to the opening image so the video feels complete, with a bold text reveal.',
      ]);
      voiceover = tone === 'Funny'
        ? 'And that, unfortunately, is the whole point. [add your punchline here].'
        : 'So here is what it all comes down to: [state your one-line takeaway].';
    } else {
      visual = 'Face or subject to camera. Simple end card text with your handle.';
      voiceover = CTA[platform];
    }
    rows.push({ time, visual, voiceover });
  });
  return rows;
}

// ---------- main ----------
function generateDemoPack(input) {
  const rand = rng(hashSeed(`${input.idea}|${input.tone}|${input.platform}|${input.duration}|${input.variant}`));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const shuffle = (arr) => arr.map((v) => [rand(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

  const kws = keywords(input.idea);
  const ideaForHook = clip(stripEnd(input.idea), 90);
  const lowerFirst = ideaForHook.charAt(0).toLowerCase() + ideaForHook.slice(1);
  const fill = (t) => t
    .replace(/\{idea\}/g, (m, offset, whole) => (offset === 0 || /[.!?]\s$/.test(whole.slice(0, offset)) ? ideaForHook : lowerFirst))
    .replace(/\{d\}/g, String(input.duration));
  const hook = fill(pick(HOOKS[input.tone]));

  const script = buildScript(input, hook, pick);

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const topic = clip(stripEnd(input.idea), 55);
  const topicLower = topic.charAt(0).toLowerCase() + topic.slice(1);
  const titles = shuffle(TITLES).slice(0, 5).map((t) =>
    t.replace(/\{Topic\}/g, cap(topic)).replace(/\{topic\}/g, topicLower).replace(/\{d\}/g, String(input.duration)));

  const caption = `${cap(stripEnd(clip(hook, 110)))}.\n\n${CTA[input.platform]}`;
  const tags = [...kws.map((k) => '#' + k.replace(/[^\p{L}\p{N}]/gu, '')),
    '#' + input.tone.toLowerCase(), ...PLATFORM_TAGS[input.platform], '#contentcreator', '#videoediting']
    .filter((t, i, a) => t.length > 1 && a.indexOf(t) === i).slice(0, 12);

  const music = MUSIC[input.tone];

  // sound effects placed on real script boundaries
  const hookEnd = script[0].time.split('-')[1];
  const payoff = script.find((r) => /So here is|punchline/.test(r.voiceover)) || script[script.length - 2];
  const payoffStart = payoff.time.split('-')[0];
  const sfx = [
    { time: '0:00', sound: 'Short impact or whoosh on the first frame to grab attention' },
    { time: hookEnd, sound: 'Soft whoosh transition from the hook into the main content' },
    ...script.filter((r) => /^Point \d/.test(r.voiceover)).map((r) => ({
      time: r.time.split('-')[0], sound: 'Light click or pop as the on-screen text appears' })),
    { time: payoffStart, sound: 'Riser ending in a short hit, then a half-second of near silence before the takeaway' },
    { time: script[script.length - 1].time.split('-')[0], sound: 'Soft notification-style ping on the call to action' },
  ];

  const w = input.duration <= 30 ? 'every 1 to 2 seconds' : 'every 2 to 3 seconds';
  const editing = [
    { page: 'Project setup', title: 'Create the timeline', detail: 'File > Project Settings. Set timeline resolution to 1080 x 1920 (vertical 9:16) and frame rate to match your footage, usually 30 fps (or 24 for a film look). Name the timeline after the video.' },
    { page: 'Media', title: 'Import and organise', detail: 'Import footage, voiceover, music and sound effects. Make bins named Footage, VO, Music and SFX so you can find things quickly.' },
    { page: 'Cut', title: 'Rough assembly from the script', detail: `Place the voiceover first. Then lay footage over it following the timestamps in your script (${script.length} sections, ${input.duration} seconds total). Do not polish yet.` },
    { page: 'Edit', title: 'Tighten the pacing', detail: `Remove every pause and breath that is not helping. Aim for a visual change ${w}. Use J-cuts and L-cuts so audio leads or trails the picture.` },
    { page: 'Edit', title: 'Add punch-ins and reframing', detail: 'In the Inspector, use Zoom and Position on the Transform section for slow push-ins (about 105% to 115%) on key lines. Keyframe them so they ease in and out.' },
    { page: 'Edit', title: 'Captions', detail: 'Add captions for every spoken line. DaVinci Resolve Studio can create subtitles from audio (Timeline > Create Subtitles from Audio); otherwise import an SRT or type them as Subtitle tracks. Check the exact menu names in your version. Keep captions inside the safe area, away from the bottom platform buttons.' },
    { page: 'Fusion', title: 'Animate the hook text', detail: `Use a Text+ title for the hook line. Keep it on screen for the whole hook (${hookEnd}) and animate scale or opacity over a few frames. Save it as a Power Bin preset to reuse.` },
    { page: 'Color', title: 'Match shots, then style', detail: input.tone === 'Cinematic' || input.tone === 'Mysterious'
      ? 'Balance exposure and white balance first. Then add a gentle contrast curve, lift shadows slightly toward blue-violet and keep highlights neutral. Add light grain.'
      : 'Balance exposure and white balance first, then add contrast and a little saturation so skin tones stay natural. Copy the grade to all clips with a shared node or Group.' },
    { page: 'Fairlight', title: 'Mix the sound', detail: 'Bring the voice to a consistent level and aim for roughly -14 LUFS overall (a common social-media target). Keep music about 18 to 22 dB under the voice, and duck it further during speech. Place your sound effects on their own track.' },
    { page: 'Deliver', title: 'Export', detail: `Choose the YouTube or custom preset: H.264, MP4, 1080 x 1920, same frame rate as the timeline. Name the file clearly. Watch the full export on your phone before uploading to ${input.platform}.` },
  ];

  return normalizePack({ hook, script, titles, caption, hashtags: tags, music, sfx, editing });
}

module.exports = { generateDemoPack, keywords };
