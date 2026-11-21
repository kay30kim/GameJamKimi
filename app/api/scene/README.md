# Builder B: scene API integration

## Endpoint and setup

- `POST /api/scene` on the same origin as the Next.js app.
- Local URL after starting the app: `http://localhost:3000/api/scene` (adjust port if needed).
- Deployment URL: `<your Vercel deployment URL>/api/scene`. No deployment exists from this change.
- This directory is a Next.js App Router route. No API key or extra package is required for this stub.
- Builder B owns scaffolding, package files, the root layout, and deployment. Preserve this directory when scaffolding. If the app uses `src/app`, move this entire directory to `src/app/api/scene` instead; do not keep both app trees.

This is an integration stub, not the Kimi engine. It returns a fixed kindness story in the selected language, ends on the third response, and does not yet adapt to lesson, age, or the selected choice. Successful responses include `X-Scene-Mode: stub`. Real generation will keep the same JSON contract.

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
3. Narration, words, and choices use the selected language. Word meanings use the other language. `newWords` may be empty.
4. When `lessonComplete` is true, `choices` is empty: render the ending and stop requesting scenes.
5. The full engine will allow up to eight scenes, counting the first and ending scenes. The stub ends after three so the complete UI flow is easy to check.
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

Later Builder A work: prompt/character brief, Kimi API integration, generated JSON validation, one retry and safe fallback, and real story completion. No frontend contract change is needed for those steps.
