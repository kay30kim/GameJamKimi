# Builder B: scene API integration

## Endpoint and setup

- `POST /api/scene` on the same origin as the Next.js app.
- Local URL after starting the app: `http://localhost:3000/api/scene` (adjust port if needed).
- Production URL: `https://gamejam-kimi.vercel.app/api/scene`.
- Vercel project `gamejam-kimi` is connected to `kay30kim/GameJamKimi`; pushes to `main` trigger production deployments.
- This directory is a Next.js App Router route. No API key or extra package is required for this stub.
- The Next.js app is already scaffolded. Run `npm ci` and `npm run dev`. Builder B owns the game client, layout, and styling; this API requires no frontend or package changes. If the app moves to `src/app`, move this entire directory to `src/app/api/scene` instead; do not keep both app trees.
- Use relative `/api/scene` calls from the app. Cross-origin browser access is not enabled; a separately hosted client should proxy requests through its own server.

Without `KIMI_API_KEY`, the API keeps the integration stub: a fixed kindness story ending on the third response, with narration in the other language and vocabulary words in the selected learning language. With a key, it calls Kimi with the lesson, language, age, learned words, and selected-choice history. Both modes return the same JSON contract.

## Builder A: server configuration

Set `KIMI_API_KEY` in `.env.local` for local development and in Vercel environment variables for deployment. Never use a `NEXT_PUBLIC_` variable for the key. Optionally set `KIMI_MODEL` (default `kimi-k3`). No new package is required. Restart the local server or redeploy after changing environment variables.

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
// data: { narration, newWords, choices, lessonComplete }
```

## Story state rules

1. Start with empty `history` and `wordsLearned`.
2. After a choice, append `{ narration: currentScene.narration, choice: selectedChoice }` to history and add the displayed words to `wordsLearned` (deduplicated). Send the updated state for the next scene.
3. `language` is the language the child is learning. Only `newWords[].word` uses it. Narration, choices, and `newWords[].meaning` use the other language, including stub, fallback, and ending scenes. For `ko`, words are Korean and narration/choices/meanings are English; for `en`, the reverse applies. `newWords` may be empty.
4. When `lessonComplete` is true, `choices` is empty: render the ending and stop requesting scenes.
5. The engine allows up to eight scenes, counting the first and ending scenes. At seven history entries, the server returns a closing without calling the model. The stub ends after three so the complete UI flow is easy to check.
6. Requests are stateless. Retrying the same stub request returns the same scene. Disable choice buttons while loading to avoid duplicate history entries.
7. Fetch after the child selects a choice. Any future prefetch must include the actual choice or cache each possible branch separately.

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

## Backend regression checks

The tests use fake provider responses, never real keys or paid requests. From the repository root:

```sh
test_output=$(mktemp -d)
./node_modules/.bin/tsc app/api/scene/engine.test.ts --outDir "$test_output" --module commonjs --moduleResolution node --target ES2022 --esModuleInterop --skipLibCheck --strict
node --test "$test_output/app/api/scene/engine.test.js"
rm -r "$test_output"
```

Remaining Builder A work: verify live model output and latency with a configured key, tune English/Korean wording for ages 3–6, and apply the final character brief. No frontend contract change is needed.
