# MVP build plan

Three people, a few hours, one goal: a working demo on Vercel. The two builders split along the API boundary, so each can work without waiting for the other. The designer owns how the game looks and sounds.

## Step 0: agree on the contract (everyone, first 20 minutes)

Lock these down before anyone splits off. Everything else can run in parallel once they're fixed.

- **Stack:** Next.js on Vercel. One repo covers the pages and the API route, and it deploys with no setup.
- **Endpoint:** `POST /api/scene`
- **Request:**

  ```json
  {
    "lesson": "kindness",
    "language": "ko",
    "age": 5,
    "wordsLearned": ["강아지"],
    "history": [{ "narration": "...", "choice": "Share your umbrella" }]
  }
  ```

- **Response:** one scene, in the shape the README describes:

  ```json
  {
    "narration": "Mina sees a puppy shivering in the rain.",
    "newWords": [{ "word": "강아지", "meaning": "puppy" }],
    "choices": ["Share your umbrella", "Keep walking"],
    "lessonComplete": false
  }
  ```

- **File ownership:** each person owns their own files, so merges stay clean (see below).

## Who does what

| Person | Role | Owns | Delivers |
| --- | --- | --- | --- |
| Builder A | Story engine (backend) | `app/api/scene/`, `lib/prompt.ts` | A Vercel function that calls Kimi K3 and returns valid scene JSON |
| Builder B | Game client (frontend) | `app/page.tsx`, `components/`, `lib/speech.ts` | The setup screen, the story loop, and speech |
| Designer | Look, feel, and voice | `styles/`, `public/`, the character brief | Mockups, the main character, the UI styling, and the story's tone |

### Builder A: story engine

1. Write the system prompt: the age-appropriate safety rules, the lesson, the language, the age, a few simple words per scene, short narration, and when to set `lessonComplete`.
2. Build `POST /api/scene`, which calls Kimi K3 with the API key from a Vercel environment variable.
3. Force JSON output and validate it. If the response doesn't parse, retry once, then fall back to a canned scene so the game never breaks.
4. Add a hard limit of about 8 scenes, in case the model never ends the story.
5. Test with `curl` in English and Korean until the scenes read well for a 3 to 6 year old.

### Builder B: game client

1. Scaffold the Next.js app, deploy it to Vercel straight away, and share the URL.
2. Build the setup screen: lesson (preset or custom), language (English or Korean), and an age slider.
3. Build the story loop against `mocks/scene.json`. Show the narration, the new words, and the choice buttons, then end on a closing screen when `lessonComplete` is true.
4. Add speech with the Web Speech API:
   - Text-to-speech reads the narration and words aloud.
   - The speak button pauses the story, listens (`ko-KR` or `en-US`), and compares the transcript to the target word.
   - It shows praise or a hint to try again.
5. Fetch the next scene while the child is reading or speaking.

### Designer: look, feel, and voice

1. **First 45 minutes:** low-fidelity mockups of the three screens (setup, scene, ending), so Builder B can build the layout.
2. Design the main character, plus one or two simple scene backgrounds or illustrations.
3. Write the character brief: name, personality, and the story's voice. Builder A pastes it into the system prompt.
4. Set up styling in `styles/`: big tap targets, a kid-friendly font that includes Korean characters, color tokens, and simple animations for praise feedback.
5. Own the demo: write the pitch and a demo script, and pick the lesson and language that show the game off best.

## Timeline

Assumes about 4 hours. Scale it to the time you have.

| Time | Builder A | Builder B | Designer |
| --- | --- | --- | --- |
| 0:00–0:20 | Contract (everyone) | Contract (everyone) | Contract (everyone) |
| 0:20–2:00 | System prompt and `/api/scene` | Scaffold, deploy, setup screen, story loop on mocks | Mockups, then the character and the brief |
| 2:00–2:45 | Speech feedback wording, prompt tuning | Speech, prefetching | Styling, assets |
| 2:45–3:30 | **Integration:** swap the mock for the real API, then fix bugs together | Same | Apply the styles, test in Chrome |
| 3:30–4:00 | Freeze features, test the parent preview flow, rehearse the demo | Same | Same |

## Rules for going fast

- **Deploy early and often.** A broken demo at minute 200 is worse than a plain one that works at minute 90.
- **Mocks unblock everyone.** Builder B never waits for Kimi K3. Builder A never waits for the UI.
- **Cut scope before you cut the demo.** If time runs short, drop prefetching, then custom lessons, then the illustrations, in that order.
- **Test in Chrome.** Speech recognition is most reliable there, so use it for the demo.
