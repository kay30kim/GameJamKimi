# GameJamKimi

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
- **Audio:** ElevenLabs generates the spoken audio: the narration for each scene and each new word, read in the target language. Like the Kimi K3 key, the ElevenLabs API key stays in a Vercel serverless function.
- **Speech recognition:** the browser's built-in Web Speech API turns the child's speech into text, and the game compares the transcript to the target word. Speech recognition works best in Chrome.
- **Safety:** a system prompt keeps content age-appropriate, and the parent can preview a run first.
- **MVP:** a setup screen for the lesson, language, and age, then the story loop. Each scene has a few choices, introduces a few simple words, and has a speak button for feedback. The loop repeats until Kimi K3 marks the lesson complete.
- **Out of scope for now:** accounts, saved progress, parent dashboards, custom art, and pronunciation scoring.

## Example lessons

- Empathy
- Kindness
- Sacrifice
- Honesty
- Sharing
- Patience
