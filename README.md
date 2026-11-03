# Borrowed Memories

A damaged memory is trying to reconstruct one childhood evening: a winter gathering in a Soviet-era apartment. Tea on the table, a samovar on the floor, toys on the carpet, a song, a knock at the door. It can't see the scene clearly. You help, and it decides.

You never type. You click objects, use the radio, and answer the memory's two-choice questions. An AI (Claude Haiku) watches what you do, keeps its own interpretation, and decides on its own what to ask, reveal, change or remove next. **Memory activity** shows what it observed, what it decided, what changed and why.

**Are we recovering a real memory, or constructing a new one together?**

> **AI intelligence runs locally.** Open the project on localhost to experience the interactive memory system. The published GitHub Pages site shows the room, but it can't reach your computer's Claude CLI.

## Run it

You need Node.js 20+ and the [Claude Code CLI](https://docs.claude.com/en/docs/claude-code), logged in (`claude` works in a terminal). No API key is used or stored.

```
npm install
npm run dev        then open http://localhost:5173 with sound on
```

`npm run dev` starts the page and the local AI backend together. Tests that use no tokens:

```
node server/check-validator.mjs   malformed AI answers are rejected
node server/check-mind.mjs        answers, contradictions and both endings, with made-up AI answers
```

## How it works

- **Pieces of the memory** (`src/mind.js`): mother, father, child, grandmother, three toys, tea table, samovar, both carpets, television, radio, weather and the knock. Each has a status (*unknown, suggested, reconstructed, uncertain, contradicted, removed*), your answer, evidence, the AI's interpretation and a confidence. The room draws each status differently: silhouette, faint, clear, blurred, glitching, gone. The photograph on the wall shows only the people reconstructed so far.
- **When the AI is asked.** Your actions add weight: looking at something again, choosing Katyusha, answering a question, standing still. The AI is called only when enough has built up, never for every click. It gets a short summary of the scene, what happened since its last decision, and its last three decisions with their results.
- **What it can do.** It must choose one of 13 actions (`src/actions.js`): ask a question, reveal, remove or alter an element, change the weather or the music, replace the radio with a television, a voice, a knock, open the front door, reveal grandmother, destabilise or restore the scene. The answer is checked in the backend and again in the page. Anything invalid becomes "wait". Claude has no tools and can't run code.
- **Your answers.** Answer A means the element was there (for the weather: snow); answer B means it wasn't (rain). Changing an earlier answer, or the AI acting against one (for example bringing back someone you said wasn't there), turns the element *contradicted*.
- **Coherence** starts at 100% and drops with contradictions, uncertainty and destabilisation. The room blurs and the music drifts out of tune. At 35% the doctor interrupts: *"That's enough for today. Take your medication and get some sleep."* Otherwise, after 16 decisions, or once the core of the scene is complete, the reconstruction holds and the ending shows which pieces came from you and which from the memory.
- **Next attempt.** Pieces reconstructed last time return as faint suggestions, which may or may not be right. "Forget everything" clears them.
- **Limits:** 16 decisions, 160 characters per text field, 4 kB per answer, 140k tokens per attempt, $0.05 per call. A decision uses about 5–7k tokens.

## Sound

Everything is made in the browser with Web Audio. "Katyusha" is a short **original placeholder** march in a similar mood. The real song and its lyrics are still under copyright, so they aren't included; a licensed recording could replace it in `src/sound.js`.

## Files

| File | What it does |
| --- | --- |
| `src/Room.jsx`, `src/room.css` | The room and how each status looks |
| `src/mind.js` | The reconstruction state, when to ask the AI, executing its actions, endings |
| `src/actions.js` | Allowed actions, JSON schema, checker |
| `src/App.jsx`, `src/index.css` | Questions, captions, Memory activity, intro and endings |
| `src/sound.js` | Music, humming, weather, knock |
| `server/mind-plugin.js` | Local backend: calls the Claude CLI (dev server only) |

## How this was made

1. Tools: Claude Code, with the model Claude Opus 5.5.
2. I decided:
3. The agent did: turned the earlier prototype into this reconstruction with two-choice questions, an AI-driven reconstruction state, two endings and offline tests, and checked it in the browser.
4. I checked:
