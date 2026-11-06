# File map

One line per file.

## The page
- `index.html` - the page you open: the Session screen (the water as a phone with Stop/Start and Save, and the dashboard: voice detection, your words, the system's narration, controls, captured thoughts and setup) and the Wording and Settings tabs.
- `style.css` - how the page looks: light mode, Helvetica Neue, the phone-sized water from the Figma design, the warm, quiet dashboard, and the small motions. No logic.
- `js/app.js` - switches tabs, builds the Settings panel and starts the Session screen.
- `js/hosted.js` - on the hosted site, uses the keys kept on Netlify (through the function below) when no .env is loaded, and handles the site passcode.
- `netlify/edge-functions/wander-api.js` - the Netlify function that holds your keys and passes requests on to ElevenLabs and Anthropic.
- `netlify.toml` - tells Netlify there is no build step.
- `.gitignore` - keeps any .env file out of GitHub.
- `js/accurate.js` - the accurate transcript made when you save: keeps the session's sound in memory, sends it once to ElevenLabs Scribe v2 with your word list, and puts the better words back into the stretches you kept.
- `js/wording-ui.js` - the Wording tab: a card per situation to plan the lines, hear them, restore defaults, save and load a copy.
- `js/live-ui.js` - the Session screen: tells the water its mode, adds boats, the timer, Stop/Start, save and the wrap-up card, the dashboard (voice detection, the quiet countdown), live words, captured list, the Sound and voice panel.
- `js/cards.js` - the tags over new boats ("converted to a task", "set a goal", "added to reflections"), and each kind's name, colour and icon.
- `js/extract-prompt.js` - your extraction prompt, word for word, and how its two blanks are filled (start time, timestamped transcript).
- `js/nlp.js` - the offline language processor: sorts a transcript into tasks, goals, reflections, concepts, stories and quotes by your prompt's rules; also picks each tag while you speak.
- `js/extract-claude.js` - sends your filled prompt to Claude, reads back the table, and checks every excerpt against the transcript.
- `js/outcomes.js` - the "Sorted thoughts" sheet after a session: the table, unclassified passages, category count, note; copy and download as Markdown.
- `vendor/compromise.js` - "compromise" 14.19, the natural language processing library (MIT licence, in `vendor/compromise-LICENSE.txt`).
- `js/seascape.js` - the water and paper boats, matched to your screen recording: calm and voice-moved while you speak, the full ocean-moved swell while quiet, still when stopped; boats sail in, never more than 10.

## The rulebook
- `js/engine.js` - the silence engine: six states, all the timing rules, commands, scratch, snooze, stop and undo. Plays no sound.
- `js/rules.js` - reads the last thing you said (finished? unfinished? emotional? a plan?) and picks which kind of clip fits, or none.
- `js/commands.js` - decides if an utterance is a voice command ("snooze", "stop", "resume", "scratch that"). Whole utterance only.
- `js/situations.js` - every moment the system can speak in (and the moments it stays silent), with when each plays and never plays.
- `js/wording.js` - keeps your own wording per situation in this browser, on top of the defaults; save and load a copy.
- `js/chooser.js` - picks which line to say for a situation, rotating variants; builds the session opener.
- `js/config.js` - every setting with its default, description and limits; saves changes in the browser; changes apply live.
- `js/narrate.js` - formats timestamped plain-English lines and the live countdown line.
- `js/dryrun.js` - replays a written transcript through the engine on a fake clock (used by the tests and `tools/dry-run-node.js`; no longer a tab).
- `js/clock.js` - the real clock and the fake clock the engine can be given.
- `js/util.js` - small helpers: numbers to words, time formatting, filling in clip templates.

## Sound (milestone 2)
- `js/live.js` - runs a real session: connects microphone, voice detection, engine, mixer and voice; loads the ocean.
- `js/audio-mixer.js` - the always-on mixer: ocean loop, its five levels, clip playback with a fast fade-out.
- `js/loop.js` - blends the end of a recording into its start so it loops with no click or gap.
- `js/ocean-synth.js` - the stand-in ocean sound, generated from noise.
- `js/ocean-store.js` - keeps your chosen sound files (ocean, after-you-speak sound, question cue, saved sound) and the made voice lines inside this browser.
- `js/cues.js` - the after-you-speak sound, the question cue and the tiny saved sounds (built-in tones, or your files).
- `js/vad.js` - voice activity detection: decides when speech starts and stops from the microphone's loudness.
- `js/mic.js` - opens the microphone and measures its loudness; explains microphone problems in plain English.
- `js/ticker.js` - a steady heartbeat that keeps running when the tab is in the background.
- `js/voice-standin.js` - the backup voice: the Mac's built-in voice, used when ElevenLabs can't be.

## Voice and key (milestone 4, first part)
- `js/keys.js` - reads your ElevenLabs key from the .env file you pick; keeps it in memory only, never saved or shown.
- `js/tts-elevenlabs.js` - turns each line into speech in your ElevenLabs voice; makes each line once and keeps it.
- `js/voice.js` - says a line: ElevenLabs voice through the mixer, or the Mac voice as backup; also the "Hear" buttons.

## Transcription (milestone 3)
- `js/stt.js` - the common shape every transcription service follows, and the switch that picks one.
- `js/stt-elevenlabs.js` - live transcription with ElevenLabs: one-time pass, live connection, audio only while speaking, reconnects.
- `js/stt-chrome.js` - live transcription with Chrome's built-in recogniser (free option).
- `js/pcm.js` - converts microphone sound to the 16 kHz, 16-bit format ElevenLabs expects.

## Content you can edit
- `clips/clips.js` - the default lines for every situation (edit them on the Wording tab instead).
- `samples/samples.js` - five example transcripts used by the tests and the terminal dry run.
- `assets/` - a place to keep your ocean recording and sound files (choose them in Sound and voice on the Session screen).

## Tests
- `tests/tests.html` - open it to run all the tests in your browser.
- `tests/harness.js` - the tiny test runner (handles tests that wait for audio to render).
- `tests/rig.js` - helper that builds an engine on a fake clock for tests.
- `tests/test-engine.js` - timing and behaviour tests for the engine.
- `tests/test-edge-node.mjs` - tests for the Netlify function (run: `node tests/test-edge-node.mjs`).
- `tests/test-accurate.js` - tests for the accurate transcript: the WAV file, the request, merging words back, and the word list.
- `tests/test-parts.js` - tests for settings, commands, rules, clips, narrate and the dry run.
- `tests/test-audio.js` - tests for the loop maker, stand-in ocean, voice detector and mixer levels.
- `tests/test-audio-browser.js` - `[sound]` tests that render real audio and measure ducking, fades and loop seams.
- `tests/test-wording.js` - tests that every situation has its own wording, your edits apply, and empty means silence.
- `tests/test-stt.js` - tests for the audio conversion and the ElevenLabs connection, against a pretend server.
- `tests/test-sea.js` - tests for the water: calm vs quiet waves, complete stillness when stopped, boats sailing in and staying, the 10-boat limit, scratched boats leaving.
- `tests/test-extract.js` - tests for sorting: the prompt is sent word for word, the offline processor follows its rules, Claude's request and answer, the copied table, the Anthropic key.
- `tests/test-voice.js` - tests for reading the .env file, the key staying out of storage, the voice request, keeping made lines, and the after-you-speak sound.

## Optional developer extras (you can ignore these)
- `tests/run-node.js` - runs the tests in a terminal, if Node is ever installed (skips the `[sound]` ones).
- `tools/dry-run-node.js` - runs a dry run in a terminal.

## Documents
- `README.md` - what it is, how to run it, how to change settings, limits, what differs from the brief.
- `HOW_IT_WORKS.md` - one session in plain English, the state diagram, and how the sound works.
- `FILE_MAP.md` - this file.
- `GLOSSARY.md` - every technical term, in one sentence.
