---
name: demo-video
description: Make or remake the shareable demo video of this app ("David's workout app"): reset the demo account with made-up history, film the live app in a phone-sized browser, and render a captioned vertical video in ~/repo/ajamjo-reels. Use when asked for a demo, promo, walkthrough or share video of the app, to refresh the existing one after the app changes, or to show a new feature in it. E.g. "/demo-video", "/demo-video add the superset sheet", "/demo-video 30 seconds, light theme".
user-invocable: true
---

# Demo video of the app

You deliver one MP4 the user can share, filmed from the real app with made-up data. Three
parts, in this order: **seed** the demo account (this repo), **film** it, **render** it
(both in `~/repo/ajamjo-reels`, project `workout`). The first video, W001, is the model:
read `~/repo/ajamjo-reels/scripts/W001-davids-workout-app.md` and
`~/repo/ajamjo-reels/src/projects/workout/` before changing anything.

Defaults, unless the user says otherwise: about 60 s, 1080x1920, dark theme, pounds,
captions only (no voice, no music), first person, ends on "David's workout app" with no
link. Free tools only: a voiceover is paid (OpenAI) and needs the user to ask for it by name.

## Facts that shape the video

- The live app is `https://working-out-mu.vercel.app`. The demo account is
  `automation@mailinator.com`. Its password is not in any repo: use the `DEMO_PASSWORD`
  env var if set, otherwise ask the user once. Pass it on the command line; never write
  it to a file, print it or film the login form.
- **The app does not track body weight.** David's own result (252 lb to 210 lb) appears
  only as text in the hook and end card. "Same / heavier / lighter" in the app is about
  lift weights against the last session (Score tab feed, exercise history).
- Captions over footage say what the app does. Never quote the demo account's numbers
  (its 5K times, its Score) as David's own results.
- Everything on screen is made up by the seed. Never film David's own account or
  `test@mailinator.com`.

## 1. Seed the demo account

```bash
DEMO_PASSWORD=... npm run seed:demo -- --dry   # builds the data, prints Score, wins, staged workout; writes nothing
DEMO_PASSWORD=... npm run seed:demo            # writes it (live Supabase, this one mailinator account only)
```

`scripts/seed-demo.ts` rebuilds about 27 weeks of runs, 5K tests, lifts, classes and a
few early misses from the plan engine, checks that no stall, drop or pain warning shows,
and **stages today's workout**: a session started 6 minutes ago with every set logged but
the last three, so three taps on camera show the tick, the rest timer, the "New best"
toast and the confetti. It works on any weekday.

- Run it right before every filming run. Filming ticks those three sets, so a second run
  without a reseed finds nothing to tick, and the workout clock keeps counting.
- It needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. A hook blocks reading that file;
  the npm script loads it for you. Never print a key.
- To show a feature the seed does not set up (a superset someone made, a swap, a class
  today), add it to the seed so every later take has it, and add its row counts to the
  seed's printed summary. Keep the `@mailinator.com` guard.
- The seed prints what the app will show. If a number looks wrong for the story (Score
  band, wins, "heavier / held / lighter" mix in the last 14 days), tune the seed, not the footage.

## 2. Film

```bash
cd ~/repo/ajamjo-reels
DEMO_PASSWORD=... npx tsx src/projects/workout/capture.ts
```

`capture.ts` signs in off camera, then records one take per part of the app into
`work/W001/<take>/` and writes `public/footage/W001/<take>.mp4` plus a `.json` with the
take's length, its marks and where each tap landed. It uses `tools/capture/recorder.ts`
(`openPhone`, `record`, `mark`, `tap`, `glideTo`, `glideToEl`, `glideInside`) and
`tools/capture/to-mp4.ts`.

For a new take or a new video:

- Find elements by role and label: tabs are `getByRole('tab', { name: 'Score' })`; set
  ticks are `Done set N` (they become `Untick set N`, so find a row by its `id`, never by
  that label); the rest timer is `getByRole('timer')` with a `Skip` button; sheets are
  `getByRole('dialog')` with a `Close` button; tapping a row in the Score feed opens that
  exercise's sheet (muscle map and history).
- Scout first with a script that only looks (screenshots, `innerText`, button labels),
  kept in `~/repo/ajamjo-reels/work/` (ignored). Only the real take may change data.
- Code passed to `page.evaluate` must not contain named inner functions: tsx breaks them
  in the page ("__name is not defined"). Use the recorder's glide helpers or a string.
- Hold still for 2 to 3 s on anything the viewer should read; scroll with the glide
  helpers, never a jump, while recording.
- After filming, build a one-frame-per-second contact sheet from the frames with Python
  and PIL (the bundled ffmpeg has no tile filter) and look at every take before using it.

**Keep out of frame** until fixed in the app (check whether they still apply):

- Stats, 5K chart: draws no lines on the live app. Start the Stats take lower down, and
  cut any clip that passes over the top of Stats.
- Stats, Weekly load: the oldest lifting bar is short, because the app loads only the
  newest 1000 sets.

## 3. Build and render

```bash
cd ~/repo/ajamjo-reels
npm run type-check
npm run reel W001-davids-workout-app     # out/W001-davids-workout-app-silent.mp4, about 2.5 minutes
```

- The words and timing are in `src/projects/workout/reels/W001.script.ts` (one scene per
  beat, `minSeconds`, captions with the second they land). The pictures are in
  `W001Demo.tsx`: each scene is a `Caption` and a `Clip` (a stretch of one take, sped up
  to fill the scene, with camera keyframes that push in on part of the screen and the
  tap marks from the take's `.json`).
- After re-filming, the take lengths, marks and tap positions change: update the `from`
  / `to` seconds and `TAPS` in `W001Demo.tsx` from the new `.json` files.
- A different video (another length, another feature) is a new `W00N.script.ts` and
  component beside W001, one more `<Composition>` in `src/projects/workout/index.tsx` and
  one more line in `src/scripts.ts`. Reuse `brand.ts`, `EndCard.tsx`, `PhoneVideo` and
  `CountUp`. Leave every Ajamjo file as it is.
- Captions: two lines at most (three run into the phone), no em or en dashes.

## 4. Check, then hand over

1. Length and size: `npx remotion ffprobe` on the MP4 (aim within 2 s of the target).
2. Pull about 18 frames across the video with `npx remotion ffmpeg -ss <t> -i ... -frames:v 1`,
   tile them with PIL and look: captions clear of the phone, the camera on the thing the
   caption is about, no login form, no warning banners, none of the "keep out of frame" items.
3. Copy the MP4 to `published/workout/<id>/` and update `scripts/<id>-*.md` (story table,
   capture date, anything kept out of frame).
4. Tell the user: the full path of the MP4, that you checked stills and not playback,
   what changed in each repo, and that the demo account now holds fresh made-up data.
   Commit only if asked; the two repos are committed separately.
