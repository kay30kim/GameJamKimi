# Alicetales

Play at [alicetales.vercel.app](https://alicetales.vercel.app) with Alice (앨리스), the bunny who guides each little adventure.

An interactive educational game for kids under elementary-school age. A parent picks a life lesson, a language, and the child's age. The child plays through a story that teaches the lesson and new words in that language, and speaks to the game to practice those words.

## How it works

1. **The parent sets up the session.** The parent picks a lesson, such as empathy, kindness, or sacrifice, or writes their own prompt. They also pick the language and set the child's age with a slider.
2. **The parent previews a run.** Before handing the game over, the parent can play through a sample run to check the content.
3. **Kimi K3 writes the story live.** For each scene, the game sends Kimi K3 the lesson, the language, the age, the words learned so far, and the child's choices. Kimi K3 generates the next scene, its choices, and a few simple new words, pitched to the child's age. Nothing is pre-scripted, so no two playthroughs are the same.
4. **The child plays one character.** The child makes choices as that character, and the story reacts to each one.
5. **The child pauses to speak.** At any point the child can pause the story and say a word out loud. The game checks whether the child said the right word and gives feedback, such as praise or a hint to try again.
6. **The story ends when the lesson lands.** Kimi K3 decides when the child has understood the lesson and wraps up the story.

## Roles

| Role    | What they do                                                          |
| ------- | --------------------------------------------------------------------- |
| Child   | Plays the single main character and speaks to practice new words.     |
| Parent  | Picks the lesson, language, and age, and previews a run.              |
| Kimi K3 | Generates each scene, its choices, its new words, feedback, and the ending. |

## Age-specific script drafts

Review the 10 topics in Korean and English for ages 3, 4, 5, and 6 at `/lesson-scripts.html`. The page includes 80 distinct drafts, age comparison, both choice outcomes, explicit phrase meanings, and practice in a new situation. These are review drafts; live game playback still generates its own scenes.

Edit the topic JSON files in [content/lesson-scripts](content/lesson-scripts/README.md), then run `npm run scripts:build` and `npm run scripts:check`.

**Runtime camera:** the main player frames the speaking character from the front or a slight three-quarter angle, follows movement, and widens for interactions. It uses rendered character headings and the measured dialogue panel height so faces stay above the text in portrait and landscape. Small camera moves settle rather than loop; reduced motion removes decorative dolly/orbit movement. A speaker's rolls and celebration spins run after the voice/caption, in an action shot. The draft shot directions remain a guide for the future scripted scenes.

Preview all six speakers, back-facing characters, action tracking, tall dialogue panels, and reduced motion at `/harbir/qa/camera`. This deterministic preview uses simulated speech and makes no audio or scene API calls.

## Architecture

The game engine is fixed and the content is variable:

- **Engine (fixed code):** screens, layout, the choice buttons, the speak button, audio playback, and speech recognition. This part never changes between runs, so it loads instantly.
- **Content (from Kimi K3):** each call returns one scene as JSON in a fixed shape, which the engine drops straight into the page. For example:

  ```json
  {
    "narration": "Mina sees a puppy shivering in the rain.",
    "newWords": [{ "word": "강아지", "meaning": "puppy" }],
    "choices": ["Share your umbrella", "Keep walking"],
    "lessonComplete": false
  }
  ```

Keeping scenes short and the shape fixed keeps each call fast. To hide the wait, the engine can request the next scene while the child is still reading or speaking.

## Scope and hosting

This is a hackathon project with a build window of a few hours, so we keep the first version small:

- **Hosting:** Vercel. The Kimi K3 API key stays on the server in a Vercel serverless function and never reaches the browser.
- **Languages:** English and Korean.
- **Audio:** The main story uses Typecast for Korean and mixed Korean/English lines, with a separately configured cast and real child voices for the child characters. English-only lines use the existing ElevenLabs cast. API keys stay on the server. Missing Korean voice configuration produces captions and a small notice instead of switching to a browser voice. See [voice setup and auditions](docs/typecast-voices.md).
- **Speech recognition:** the browser's built-in Web Speech API turns the child's speech into text, and the game compares the transcript to the target word. Speech recognition works best in Chrome.
- **Safety:** a system prompt keeps content age-appropriate, and the parent can preview a run first.
- **MVP:** a setup screen for the lesson, language, and age, then the story loop. Each scene has a few choices, introduces a few simple words, and has a speak button for feedback. The loop repeats until Kimi K3 marks the lesson complete.
- **Out of scope for now:** accounts, saved progress, parent dashboards, custom art, and pronunciation scoring.

## Run locally

You need Node.js 20.9 or later for the app, and Node.js 22 or later for the voice audition tool.

```bash
npm install
cp .env.example .env.local   # only on first setup; preserve an existing .env.local
npm run dev
```

Open http://localhost:3000. If that port is busy, Next.js picks the next free one and prints it. Edits reload in the browser as you save.

Add the story API key and speech keys to `.env.local`. For Korean audio, set `TYPECAST_API_KEY`; the app includes the reviewed cast in `lib/typecast.ts`. Optional `TYPECAST_VOICE_*` overrides let you replace individual roles after auditioning API voice IDs with `npm run voices:list` and `npm run voices:sample -- --voice <voice_id>`. Restart the dev server after changing these settings. On Vercel, also add `TYPECAST_API_KEY` to the project's Production and Preview environments and redeploy: `.env.local` is not uploaded by Git. The older `/demo` and `/kay` prototypes have separate audio paths and are not migrated by this change.

Until the API is ready, the game client can read the sample scene in `mocks/scene.json`, so the UI works without any API keys.

## Example lessons

- Empathy
- Kindness
- Sacrifice
- Honesty
- Sharing
- Patience

## Reusing generated stories and voices

The scene and speech APIs read saved content before generating it again. Scene keys include the model, prompt version, age, language, opening, learned words, choices and the complete continuing world state. Voice keys include the exact text, language, provider, model, voice and synthesis settings. Different branches and voices remain separate; failed generations are not saved.

- **Cloud:** connect a **private Vercel Blob store** to this project. The SDK uses `BLOB_STORE_ID` with Vercel OIDC credentials, or a server-only `BLOB_READ_WRITE_TOKEN` outside Vercel. The code does not create or connect a store automatically. Cloud persistence is available only after that connection is configured and deployed.
- **Local:** without Blob configuration, generated files persist under `.cache/generated/v1/` across server restarts. This directory is ignored by Git. `GENERATED_CACHE_DIR` can set another cache root.
- **Fallback:** a deployed function without Blob configuration has only a bounded in-memory cache. Storage failures are bypassed so an unavailable store does not stop the story; reads and writes each have a 1.5-second deadline.

The private store contains generated scene JSON and MP3s under opaque hash paths, not public URLs or API keys. The first unseen request still needs generation; saved requests reuse their output. `X-Scene-Cache` and `X-Generated-Cache` response headers report reuse. Set `GENERATED_CACHE_DISABLED=1` to bypass reuse during debugging. To invalidate content after a prompt or voice-policy change, bump the corresponding cache revision in the scene or speech cache key; old entries then become unreachable. Remove only obsolete files under this application's `generated/v1/scene/` or `generated/v1/tts/` prefixes when reclaiming storage.
