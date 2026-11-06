# Wander

A calm voice-first space for brain-dumping and voice-noting while your hands or mind are busy. Its defining quality is a lot of room for silence: the system speaks rarely, never takes the floor early, and always offers a cheap way out. A soft ocean plays underneath; it turns right down when you speak and comes back once you have been quiet for a few seconds. Each thought you finish is captured as a reflection, a task or a goal, with a tiny sound, so you know it was logged.

**Where this is: milestone 3 part 1, plus the ElevenLabs voice from milestone 4.** The rulebook, the sound (ocean loop, ducking, voice detection), **live transcription** and **your ElevenLabs voice** all work. The dot next to "Listening" blinks the moment you start speaking, so you always know your voice is being recorded. Saving sessions is milestone 3 part 2.

**Calm by design:** every wait before the system may speak is at least one full minute. People need time to collect a thought, process it, and then say it.

## How to run it (no installing)

1. Unzip the folder anywhere on your Mac.
2. Double-click `index.html`. Open it in **Chrome**.
3. **Put headphones on** before you start a session.

There is nothing to install and no terminal. Nothing is published online. What leaves your Mac: your voice while you speak (to the transcription service you choose), and the system's lines, sent once to ElevenLabs to be turned into speech.

**First time each session:** in *Sound and voice* on the right, press **Load .env** and pick your key file (see *Your ElevenLabs key* below).

## The screens

- **Session** (the main screen, built from your Figma design). Press **Start** on the water.
  - **The water shows what is happening, without words**, and follows your screen recording: long swells that heave and travel, with the layers moving against each other. While you speak, the waves calm to small, slow swells and **your voice moves them**: louder words lift the crests, pauses let them settle. While you are quiet (it is still listening), the full swell returns and **the ocean sound moves it**. When stopped (and while snoozed), the water is completely still. How much sound moves the waves is `waveReactivity` in Settings (0 turns it off).
  - **Paper boats and tags** (off by default; turn on with the **Show paper boats** switch). Each time a thought is captured, a paper boat sails in from outside the frame and settles on the water, and a small tag rises above it saying what happened: **converted to a task**, **set a goal** or **added to reflections**. The tag fades after 5 seconds (`tagShowMs`). One also sails in every 40 words you say (Settings, *The water on screen*; 0 turns that off). Boats stay where they are while you're quiet, and there are never more than 10. "Scratch that" sails the scratched thoughts' boats away.
  - **On the water:** the state ("Listening", sitting behind the water so the swells pass in front of it, with a dot that blinks while your voice is being recorded), the session time (stopped time doesn't count), and **Stop / Start**. Stop is the same as saying "stop"; Start after a stop is the same as saying "resume" (within 10 seconds it undoes the stop; after that it starts a new session). While snoozed it says **Resume**.
  - **save** under the water opens *Wrapping up?*: how long you spent, and how many reflections, goals and tasks were caught. *Finish and sort* ends the session; *keep talking* goes back.
  - **The layout.** The water is a phone-sized screen on the left, with **Save** underneath, as in the Wander designs. The **dashboard** on the right shows, in order of importance:
    - **Voice detection.** Is it hearing speech right now? Two bars side by side: **You** (your voice, with the line it must cross to count as speech) and **Ocean** (the ocean's volume, dropping while you speak and rising after).
    - **What you said.** The live transcript, with a box to type instead.
    - **What the system is doing.** The full narration of every decision.
    - **A side column** with the controls and voice commands, the Captured list, and *Sound and voice*.
  - **Focus.** The button at the top right of the water hides the dashboard. On a narrow window the dashboard sits under the phone.
  - The ocean fades in. Chrome asks to use the microphone; allow it. Because the page is opened from a file, Chrome will probably ask again each time you open it. That's normal.
  - Stay quiet for a moment while it learns how noisy the room is, then talk.
  - **While you speak:** *Voice detection* says **Speech detected**, the dot next to "Listening" blinks, and the ocean drops to 5%. **No sound plays when you start speaking.**
  - **When you stop:** after 2 seconds of quiet, the ocean rises back gradually over 3 seconds. At 5 seconds of quiet, **your after-you-speak sound** plays: the file you chose under *Sound and voice* (or a built-in soft rise until you choose one). Turn it on or off with the **Sound after you speak** switch in the controls.
  - Your words appear under **What you said** as you speak, grey while you're still talking and settled once you stop.
  - **Copying.** Hover over any line under *What you said* or *Captured* and a **Copy** button appears. The copy icons in the panel headers copy everything at once: the whole transcript, all captured thoughts ("Task: ..."), or just the tasks as a checklist ("- [ ] ...") ready to paste into Notes, Notion or Things.
  - **Captured.** A finished sentence followed by 5 seconds of quiet counts as a finished thought. It lands in the **Captured** list as a *reflection*, a *task* or a *goal*, with a tiny sound (one note, two notes, or a rising pair). An unfinished sentence ("...and") waits for the full 90 s before it is captured.
  - The system waits at least a minute before it may speak. Before a **question** it plays a soft cue, then speaks in your ElevenLabs voice (or the Mac's built-in voice if no key is loaded). Soft lines like "Mm." have no cue.
  - While snoozed, nothing you say is shown or kept.
  - The page never scrolls on a laptop or desktop; each dashboard panel scrolls inside itself.
  - Say "snooze for one minute", "scratch that", "stop" or "resume" on its own and it works as a command.
  - You can still type what you said instead, and press Enter.
  - *Hold to talk* forces "I am speaking" while you hold it. With the microphone on, it also sends that stretch to transcription (push-to-talk). With the microphone off, it just pretends.
  - The command buttons do the same as the spoken commands.
- **Wording.** Plan exactly what the system says in every situation (see below).
- **Settings.** Every value, with a plain-English description. Changes save in this browser and apply immediately, even mid-session.

## Planning the wording

Open the **Wording** tab. It has one card for every situation the system can speak in, in the order a session unfolds:
- starting a session
- after a finished thought
- after an unfinished thought
- soft responses
- when you don't answer
- confirming a command
- when something goes wrong

Each card says **when it plays** and **when it never plays**. Write one line per way of saying it; the system rotates through them. A few things to know:
- **Saving.** Click outside the box to save. Changes apply straight away, even mid-session, and stay in this browser when you open a new version of the folder.
- **Hear a line** plays one in your ElevenLabs voice (or the built-in voice without a key). **Restore default** undoes your edits.
- **Silence is allowed.** Leaving a card empty means the system stays quiet in that situation. The three problem cards can't be emptied, because failures are never silent.
- **Blanks** like `{minutes}` are filled in when the line is said; each card lists the ones it can use.
- **Warnings** appear if a line is too long to say in about 6 seconds, uses a blank the card can't fill, or asks a question where questions are not allowed.
- **Backups.** *Save a copy* downloads all your wording as a file; *Load a copy* brings it back. Send me that file if you want your wording built in as the default.
- **Every outcome is covered.** At the bottom is the list of moments where the system deliberately says nothing.

The **words that decide which situation applies** (emotional and heavy words, plan words, "that's it", the unfinished-sentence endings) are in **Settings, under "Word lists the rules use"**.

## Sorting your thoughts (your extraction prompt)

When you save a session (*finish and sort*, or *End session*), the whole transcript is sorted into explorable items: **task, goal, reflection, concept, story and quote**, following your extraction prompt exactly. A sheet opens with your table (order, timestamp, primary category, item, status, exact transcript excerpt, polished paraphrase, linked items, confidence), then the unclassified passages, the category count (zeros included) and the note. **Copy table** and **Download .md** give the same thing as Markdown for your notes. *Show the last sorted session* in the controls opens it again.

Two things can do the sorting:
- **Claude, with your prompt.** If your .env file also has `ANTHROPIC_API_KEY=...`, your prompt is sent to Claude word for word, with only its two blanks filled: the session start time, and the transcript with a [minutes:seconds] time on each stretch of speech. *Show the prompt* lets you read exactly what was sent. Every excerpt Claude returns is checked against the transcript; any that is not there word for word is underlined in red.
- **The language processor (offline, free).** "compromise", a natural language processing library, reads sentences, verb tense, "need to" versus "could", questions and narrative order, and applies the same rules: committed versus proposed tasks, a goal linked to its step, a story kept apart from the reflection it leads to, quotes only in your exact words, no invented timestamps, and "low" confidence with a reason when the wording is ambiguous. It shows instantly; with a key, Claude's answer replaces it a few seconds later. If Claude fails, the offline sort stays, with the reason.

The language processor also picks each **tag while you speak**, now covering all six kinds: "converted to a task", "set a goal", "added to reflections", "added to concepts", "kept as a quote", "saved as a story".

Settings, *Sorting your thoughts after a session*: who sorts (`auto`, `claude`, `nlp`, `off`), which Claude model (default `claude-sonnet-5-5`), and how long a silence starts a new passage for the offline sort.

## Fonts and icons

The page uses **Neue Haas Grotesk** (Text Pro and Display Pro) if it is installed on your Mac, for example through Adobe Fonts; otherwise Helvetica Neue. Icons are **Google Material Symbols**, loaded from Google Fonts, so they need the internet. Offline, icons stay blank instead of showing their names.

## Putting it online (Netlify), with your keys kept on Netlify

On your Mac, the page reads your keys from a .env file you pick. Online, you can keep the keys on Netlify instead, so the site works without a .env. The keys stay on Netlify's servers; the page never receives them. A small Netlify function (`netlify/edge-functions/wander-api.js`) adds the key to each request on the way to ElevenLabs or Anthropic.

Netlify's drag-and-drop upload can't run functions, so the site has to come from GitHub:

1. **Put the folder on GitHub.** Create a repository (for example `wander`) and upload everything inside this folder, including the `netlify` folder, `netlify.toml` and `.gitignore`. Never upload your `.env`.
2. **Connect it to Netlify.** In Netlify: *Add new project > Import an existing project > GitHub*, pick the repository. Leave the build command empty and the publish directory as `.` (`netlify.toml` already says this). Deploy.
3. **Add your keys.** *Project configuration > Environment variables > Add a variable*:
   - `ELEVENLABS_API_KEY` = your ElevenLabs key
   - `ANTHROPIC_API_KEY` = your Anthropic key (optional)
   - `WANDER_PASSCODE` = a word only you know. **Set this.** Without it, anyone with the link can use your ElevenLabs and Anthropic credits.
4. **Redeploy** (*Deploys > Trigger deploy*). Netlify only picks up new variables on the next deploy.
5. Open the site. Under *Sound and voice*, type the passcode once. It says "Using the keys kept on this site", and everything works with no .env. The passcode (never a key) is remembered in that browser; press *Forget* to remove it.

Good to know:
- A .env you load still works and takes priority.
- The live transcription connection still goes straight to ElevenLabs. The site only hands out its one-time pass.
- Through the site, the accurate transcript is sent in 2-minute pieces, so no single request is too big.
- Claude can take longer than Netlify's 40-second limit to start replying, so the function keeps the line open until Claude is done.
- Every change you push to GitHub redeploys the site automatically.

## Your ElevenLabs key (a .env file)

The key is never typed into the page and never saved in the browser. It lives in a small text file on your Mac.

1. Log in at elevenlabs.io and open *Developers*, then *API Keys* (menu names may differ slightly). Create a key and allow **Speech to Text** and **Text to Speech**.
2. Open TextEdit, choose *Format, Make Plain Text*, and type one line: `ELEVENLABS_API_KEY=your-key-here`. To let Claude sort your sessions, add a second line: `ANTHROPIC_API_KEY=your-anthropic-key` (from console.anthropic.com, *API keys*).
3. Save it in the Wander folder (the `voice-space` folder you unzipped). Name it `elevenlabs.env` (easy to see). If you name it `.env`, the Mac hides it: in the file picker press **Cmd + Shift + .** to show hidden files.
4. Each session, press **Load .env** in *Sound and voice* and pick the file. The page shows the last 4 characters so you know it worked. The key is kept in memory only and is gone when you close or reload the tab. **Forget** drops it straight away.

Never paste the key into a chat or send the file to anyone.

## The ElevenLabs voice

Every line is spoken in voice **U9VgC8Xinl7nnNsyDd3J** using the *eleven_multilingual_v2* model. To change either, see Settings, Voice.
- **The voice must be in your account.** If ElevenLabs says it can't find the voice, add it to *My Voices* in ElevenLabs first.
- **Made ahead and kept.** When a session starts, every fixed line is made once, in the background, and kept in this browser, so it plays instantly and costs nothing next time. *Sound and voice* shows the progress ("ElevenLabs voice ready (42 lines)"). A line is only made again if you change its wording, the voice, the model or the voice settings. Lines with blanks (like `{minutes}`) are made when needed.
- **Talking over it** fades it out in 150 ms, as the brief asked.
- **If it fails** (no key, wrong key, no credits, no internet), the page says why once and uses the Mac's built-in voice, so a line is never lost.
- **Hear** next to Voice plays a sample line.

## Setting up transcription

In *Sound and voice*, under **Transcription**, choose:

- **ElevenLabs** (best accuracy). Uses the key from your .env file. ElevenLabs charges for the audio it transcribes; to keep that low, audio is only sent while you are actually speaking, never during silence.
- **Chrome built-in**: free, no key, but your audio goes to Google, and it is usually less accurate.
- **Off**: no transcription; type instead.

**Getting the right words.** Four things help ElevenLabs hear you correctly:

- **Words to listen for** (under *Sound and voice*). Type names and unusual words, separated by commas: `Coot-tha, Jeremy, DXB311, Wander`. Live transcription uses up to 50 of them (20 letters each); the accurate transcript uses all of them.
- **Language** is fixed to English (`sttLanguage`), so it never guesses another language from a mumble.
- **Background filtering** (`sttFilterBackground`) asks ElevenLabs to ignore other voices and noise. The ocean is ducked while you speak, so it rarely gets in.
- **The accurate transcript** (`sttAccuratePass`, on). Live transcription must guess each short stretch on its own in under a second, which is where most wrong words come from. When you save, the whole session's sound is sent once to ElevenLabs' standard model, **Scribe v2**, which hears each word in the context of everything you said. Its words replace the live ones under *What you said* (marked "Accurate transcript") and are what gets sorted. It also recovers stretches the live transcription missed completely. Scratched speech and anything said while snoozed are left out. The sound is kept only in this tab's memory and discarded after the save; it is never written to disk. It costs a second transcription of the session (keyterms add about 20%), so turn it off if credits are tight. Sessions longer than 90 minutes are cut at 90 (`accuratePassMaxMinutes`).

**Wispr Flow.** Wispr Flow has no public API, so Wander can't use its model directly. You can still use it: click the type box under *What you said* and dictate with Wispr Flow as you would anywhere else on your Mac. The words arrive as typed text.

## Using your own sounds

Use the **Sound and voice** panel on the right of the Session screen:
- **Question cue.** *Choose* to use your own cue before questions; *Hear* plays it. *Reset* goes back to the soft placeholder.
- **Saved sound.** The built-in tiny tones differ by kind (try the Reflection, Task and Goal buttons). If you choose your own file, it plays for every kind.
- **Ocean.** See below.

The cue and saved sound can be turned off or made quieter in Settings, Ocean sound (`pauseCueEnabled`, `pauseCueAfterMs`, `promptCueEnabled`, `savedCueEnabled`, `cueVolume`, `promptCueGapMs`).

## Using your own ocean recording

In the same panel, click **Choose** next to Ocean and pick your file (WAV, MP3, M4A or AAC). A copy is kept inside this browser so you only do this once. *Reset* removes it. A minute or more sounds best; the last 3 seconds are blended into the start so the loop has no click or gap (setting: `oceanLoopCrossfadeMs`).

Until you choose a file, a stand-in ocean made from filtered noise plays. It is a placeholder and your recording will sound much better.

## Running the tests

Open `tests/tests.html` in Chrome (or click *Run the tests* on the page). Wait a few seconds for the green banner: **All 173 tests passed**. The tests marked `[sound]` render real audio inside the browser and measure it: duck speed, return speed, loop seams, clip fade-outs.

## Changing settings

Open the **Settings** tab. Groups:

- **Timing**: the silence rules. Opener 60 s; follow-up after a finished thought 60 s; after an unfinished thought or a question to yourself 90 s; before speaking again when you didn't answer 90 s; breath buffer 1 s; ocean starts rising after 2 s of quiet and is fully back by 5 s; a finished thought is captured after 5 s of quiet; a new topic after 2 minutes of silence. No speaking wait below 60 s is allowed.
- **Ocean sound**: normal volume 60%, ducked 5%, under a clip 35%, duck speed 200 ms, return 2 s, fade in/out 3 s, loop blend 3 s, clip cut-off fade 150 ms. Also the question cue and the saved sound.
- **Microphone and voice detection**: how sensitive the speech detector is. If it triggers on room noise, raise `vadOnsetDb`. If it misses quiet speech, lower it. If the ocean flickers between words, raise `vadHangoverMs`.
- **Transcription**: which service, language (leave empty to detect), and how much sound before your first word is kept (0.5 s).
- **Voice**: the ElevenLabs voice ID, the model, and how it sounds (steadiness 0.8, likeness 0.75, style 0, speed 0.9). Higher steadiness is calmer and more even. Whether to make lines ahead of time.
- **Stand-in voice**: the backup voice, which built-in Mac voice to use (`standInVoiceName`, e.g. "Karen"), and its speed. To hear the options, open System Settings, Accessibility, Spoken Content, System voice.

Change what the system says on the **Wording** tab. The default lines live in `clips/clips.js`.

## Limits worth knowing

- **Headphones.** Without them, the ocean and the voice leak into the microphone. The detector becomes less sensitive while the system speaks, and Chrome's echo cancellation helps, but neither is perfect.
- **The detector listens to loudness, not words.** It can't tell your voice from someone else's or from a loud TV, so ducking reacts to any voice nearby, and their words may be transcribed too.
- **Tested against a pretend ElevenLabs.** I couldn't reach ElevenLabs from my workspace, so transcription and the voice were tested against a fake server that follows their published format. If your first real try fails, the page shows ElevenLabs' reason; send me that line.
- **Waiting a minute is real.** Testing the follow-ups takes patience. To try the rules faster, shorten the waits in Settings.
- **The backup voice can't fade.** When you talk over the Mac's built-in voice, it stops instantly. The ElevenLabs voice fades properly.
- **Detection follows loudness.** *Speech detected* reacts to any voice or loud sound nearby, not only yours.
- **Keep the tab open.** Background tabs are slowed by Chrome. The timers run in a helper that is slowed much less, and pages playing sound are mostly left alone, but don't close the tab or let the Mac sleep mid-session.
- **The accurate transcript sends your session's sound to ElevenLabs** once, when you save. Turn off `sttAccuratePass` to send only the speaking stretches live.
- **Sorting sends your words to Anthropic** when an Anthropic key is loaded (only the transcript, once, when you save). Choose `nlp` in Settings to keep sorting fully on your Mac.
- **Claude was tested against a pretend server.** I could not reach Anthropic from my workspace. The request follows Anthropic's published format; if your first real sort shows an error, send me the line.
- **The offline sort reads wording, not meaning.** It is good at "I need to" and "I want to", fair at feelings and stories, and cautious with ideas and quotes (it marks low confidence rather than guessing). Claude reads for meaning.
- **Not a crisis tool.** Heavy or self-critical talk gets only a soft "Mm." or "I'm here.", but the system does not detect or respond to danger.
- **Recording consent.** When wizard mode arrives, get a participant's consent before recording them.

## What is different from the original brief

| Brief | This build |
|---|---|
| Python 3.11, terminal | HTML and JavaScript in Chrome. Nothing to install. |
| sounddevice + numpy mixer | The browser's built-in audio system (Web Audio) |
| Silero VAD or webrtcvad | A simple loudness-based detector with an adaptive noise floor (no download needed). It can be swapped later. |
| `assets/ocean.wav` read from disk | A *Choose your ocean recording* button (a page opened from a file is not allowed to read its folder) |
| `settings` command | Settings tab |
| `clips/clips.json` | `clips/clips.js` (same data) |
| SQLite and WAV files | Browser storage and export buttons (milestone 3) |
| Textual wizard screen | A keyboard-driven wizard page (milestone 7) |
| Secrets in `.env` | Same idea: the key lives in a .env file. You pick it once per session (a page opened from a file can't read its folder by itself); it is held in memory only. |
| Defaults 10 s / 5 s / 9 s / 10 s waits | At least 60 s for every wait (your change, for calm technology) |
| No confirmation sounds at pauses | One soft sound after 5 s of quiet (a thought's saved tone if one was saved), and a soft cue before questions (your change). Both can be turned off. |
| A terminal tool with no screen | The water and paper boats from your Figma design, phone-sized, beside a dashboard led by voice detection and your words (your change) |
| Ocean returns 1 s after speech ends | Starts rising after 2 s and rises gradually over 3 s (the first user test said a 1 s return felt like a nudge while still thinking) |
| No sound when speech starts | Still none: a blinking dot and *Speech detected* show it instead. The sound moved to 5 s after you stop (your change) |
| Streaming Scribe | Scribe v2 Realtime, sending audio only while you speak, with manual commits at the end of each stretch |

## Roadmap

1. **Done:** settings, silence engine, commands, tests, dry run, narrate mode.
2. **Done:** ocean loop, ducking, voice detection, clip playback (stand-in voice).
3. **Part 1 done:** live transcription (ElevenLabs or Chrome), voice commands by voice. Part 2: session recording, splitting into thoughts, saving and export.
4. **Partly done:** the ElevenLabs voice, made ahead and kept. Still to do: browsing and auditioning voices.
5. **Partly done:** sorting a saved session with your extraction prompt (Claude) and an offline language processor; tags for all six kinds. Still to do: using AI while you speak to choose what to say.
6. Commands wired end to end by voice, event export.
7. Wizard-of-Oz controller and summary.

Other files: `HOW_IT_WORKS.md` (one session in plain English, plus diagrams), `FILE_MAP.md` (what every file does), `GLOSSARY.md` (every technical term).
