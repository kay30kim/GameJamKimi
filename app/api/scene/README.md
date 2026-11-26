# Builder B: scene API integration

## Endpoint and setup

- `POST /api/scene` on the same origin as the Next.js app.
- Local URL after starting the app: `http://localhost:3000/api/scene` (adjust port if needed).
- Production URL: `https://alicetales.vercel.app/api/scene`.
- Vercel project `alicetales` is connected to `kay30kim/GameJamKimi`; pushes to `main` trigger production deployments.
- This directory is a Next.js App Router route. No API key or extra package is required for this stub.
- The Next.js app is already scaffolded. Run `npm ci` and `npm run dev`. Builder B owns the game client, layout, and styling; this API requires no frontend or package changes. If the app moves to `src/app`, move this entire directory to `src/app/api/scene` instead; do not keep both app trees.
- Use relative `/api/scene` calls from the app. Cross-origin browser access is not enabled; a separately hosted client should proxy requests through its own server.

Without `KIMI_API_KEY`, the API plays a deterministic three-scene story, with dedicated stories for body boundaries and table manners. With a key, it calls Kimi with the lesson, language, age, learned words, selected-choice history, and completed world state. In both modes the selected language is the primary story language, with brief translations supporting learning.

## Builder A: server configuration

Set `KIMI_API_KEY` in `.env.local` for local development and in Vercel environment variables for deployment. Never use a `NEXT_PUBLIC_` variable for the key. Optionally set `KIMI_MODEL` (default `kimi-k3.1-pro-highspeed`, the fastest K3 model). No new package is required. Restart the local server or redeploy after changing environment variables.

The request uses Moonshot's [Chat Completions API](https://platform.kimi.ai/docs/api/chat), JSON mode, low reasoning effort, and a 4,096-token completion budget. Each attempt times out after 20 seconds. Invalid, truncated, or malformed model responses, network errors, HTTP 429, and server errors retry once. Other HTTP errors (including invalid credentials) immediately fall back. The route has a 60-second execution budget.

`X-Scene-Mode` identifies how a successful response was produced:

| Value | Meaning |
| --- | --- |
| `stub` | No key: deterministic three-scene integration story |
| `kimi` | Validated model-generated scene |
| `fallback` | Generation failed: localized neutral closing scene |
| `limit` | Server-enforced closing at scene eight or later |

Fallbacks deliberately end the story instead of inserting an unrelated scene into a generated story. JSON validation checks structure, text limits, vocabulary, and ongoing/ending choice counts; it is not a content moderation system. Review generated stories with a parent before the demo. The character brief in `lib/prompt.ts` is provisional until the designer supplies one.

## Client call

Import `SceneRequest`, `SceneResponse`, and `SceneErrorResponse` from `app/api/scene/contract.ts` using `import type` and a relative path or your configured alias.

```ts
const response = await fetch("/api/scene", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    lesson: "kindness",
    language: "ko",
    age: 5,
    wordsLearned: [],
    history: [],
  }),
});
const data = await response.json();
if (!response.ok) throw new Error(data.error.message);
// data: { narration, newWords, choices, lessonComplete, stage }
```

## Stage: what the 3D engine plays

Every response has a `stage` for the scene. The world is fixed: every story happens in Sunny Meadow, and `lib/world.ts` lists every spot (with its `[x, z]` position in meters), actor, prop, weather, emotion, and action. The prompt and the server both read that file, so the model can only use names the engine knows.

```json
"stage": {
  "weather": "rainy",
  "cast": [{ "actor": "hero", "at": "path" }, { "actor": "puppy", "at": "tree" }],
  "props": [{ "prop": "umbrella", "at": "hero" }],
  "beats": [
    { "actor": "hero", "action": "walk_to", "target": "puppy" },
    { "actor": "hero", "action": "give", "prop": "umbrella", "target": "puppy" },
    { "actor": "puppy", "action": "emote", "emotion": "happy" }
  ]
}
```

- `cast` gives each actor's initial spot and always includes `hero` (Alice the bunny, the child's character). On continuations, existing actors keep their actual positions; these spots seed only new actors.
- A prop's `at` is either a spot or the id of an actor holding it. Existing props keep their actual ownership and position across choices.
- `beats` has one to four steps, played in order. Optional `cue` indexes speech: 0 is narration, 1 is the first dialogue line. The next line waits for both speech and its actions. The `Beat` type in `lib/world.ts` lists the exact fields for each action.
- The server repairs the stage instead of rejecting the scene. It drops unknown names and malformed beats, adds anyone or anything a beat needs at its usual spot, and falls back to Alice looking happy if no beats are left. The engine can play any stage it receives without checking names.
- The stub returns hand-written stages for its three scenes, so you can build the engine without a key.

To grow the world, add an entry to `lib/world.ts`. The prompt picks it up automatically; the engine needs a model and animation for it.

## Story state rules

1. Start with empty `history` and `wordsLearned`.
2. After a choice, append `{ narration: currentScene.narration, choice: selectedChoice }` to history and add the displayed words to `wordsLearned` (deduplicated). Include `continuation: { world, previousLines, previousBeats }`, where `world` is the completed `WorldSnapshot`, not the next scene's declared starting positions. The opening is used only for the first scene.
3. `language` is the primary interface, narration, dialogue, choice, and practice language: `ko` means Korean and `en` means English. `newWords[].word` uses that language; `newWords[].meaning` is a brief translation in the other language. Character lines can include a short natural bilingual example, such as “나는 지금 슬퍼. 영어로는 I'm sad.” `newWords` may be empty.
4. All ages can practice when new words are present. Alice voices the practice invitation, then the player waits for the child to speak or choose to listen and continue. This never automatically picks a story branch. When `lessonComplete` is true, `choices` is empty: finish any practice, render the ending, and stop requesting scenes.
5. The engine allows up to eight scenes, counting the first and ending scenes. At seven history entries, the server returns a closing without calling the model. The stub ends after three so the complete UI flow is easy to check.
6. Requests are stateless. Retrying the same stub request returns the same scene. Disable choice buttons while loading to avoid duplicate history entries.
7. Prefetch only after the current world outcome is known, while the child practices or reads choices. Cache each possible choice and continuation state separately. Replays restore the current part's own initial snapshot.

## Errors

Invalid JSON or invalid fields return HTTP 400:

```json
{ "error": { "code": "INVALID_REQUEST", "message": "..." } }
```

Required input: nonblank lesson of at most 500 characters, language `en` or `ko`, integer age 3–6, up to 100 learned words (100 characters each), and up to eight history entries (narration up to 4,000 characters, choice up to 500). All five request fields are required. Handle network failures and non-OK responses with a retry UI as well.

## Smoke check after Builder B starts Next.js

```sh
curl -i http://localhost:3000/api/scene \
  -H 'Content-Type: application/json' \
  -d '{"lesson":"kindness","language":"ko","age":5,"wordsLearned":[],"history":[]}'
```

## Reusing generated scenes

Successful model scenes are stored through the private generated-content cache. The key includes the model, actual prompt, lesson, age, language, opening, learned words, complete choice history, and exact continuation state. Different branches, actor positions, prop owners and previous dialogue cannot share an entry. Failed-provider fallbacks, missing-key stubs and scene-limit closings are not saved. Corrupt entries and storage outages fall back to generation. API responses remain `Cache-Control: no-store`; `X-Scene-Cache` reports `hit`, `miss` or `bypass`.

Preview a preparation plan without calling either generation provider:

```sh
node scripts/warm-generated.mjs --dry-run
node scripts/warm-generated.mjs --lesson kindness --age 5 --language ko --dry-run
```

The default plan contains 80 opening scenes: ten runtime topics × four ages × two languages, using the first supported opening per topic. `--openings all` covers every opening the game can choose. The plan reads IDs from `lib/lesson-guides.ts`; editorial drafts in `content/lesson-scripts/` are not injected into the runtime.

Execution requires both `--execute` and a bounded `--limit`. Add `--audio` to prepare the matching narration, character dialogue, practice word, invitation and praise through `/api/tts`. These calls can consume provider credits. The app must already be running; `--base-url` can select the deployed app when private cloud storage is configured there.

```sh
node scripts/warm-generated.mjs --lesson kindness --age 5 --language ko --execute --limit 1 --audio
```

Continuation scenes are reused only for the exact prior world and choice; opening preparation does not pre-generate every possible story branch. Storage setup is documented in the project README.

## Backend regression checks

The tests use fake provider responses, never real keys or paid requests. From the repository root:

```sh
test_output=$(mktemp -d)
./node_modules/.bin/tsc app/api/scene/engine.test.ts --outDir "$test_output" --module commonjs --moduleResolution node --target ES2022 --esModuleInterop --skipLibCheck --strict
node --test "$test_output/app/api/scene/engine.test.js"
rm -r "$test_output"
```

Remaining Builder A work: verify live model output and latency with a configured key, tune English/Korean wording for ages 3–6, and apply the final character brief. No frontend contract change is needed.
