# Glossary

Terms in the order you meet them. Updated at every milestone.

**Silence engine.** The part that decides *when* the system may speak. It only decides; it plays nothing.

**State machine.** A design where the system is always in exactly one situation (a "state") and specific events move it to another. Ours has six: Idle, Listening, PauseWindow, Prompting, Snoozed, Stopped.

**Utterance.** One stretch of speech between pauses; roughly one spoken sentence or phrase.

**Transcript.** The words of what you said, as text. *Interim* means a partial guess that may still change; *final* means settled.

**Breath / end-of-speech buffer.** A short pause (1 second) that is too brief to count as having stopped. The silence clock only starts after it.

**Pause window.** The time after you stop speaking when the system waits, silently, to see if you continue.

**Threshold.** The length of the wait before the system may speak (60 s after a finished sentence, 90 s after an unfinished one).

**Backchannel.** A tiny prompt that invites you to continue without steering you, like "Go on." or "Mm."

**Clip.** One line of speech the system is allowed to say. It only chooses from a fixed library; it never makes up sentences.

**Backoff.** The extra wait (90 s) after the system speaks and you don't answer, so it doesn't pile on.

**Self-addressed question.** A question you ask yourself ("what else did I think about?"). The system never answers it.

**Segment / thought.** A stretch of talking. A silence of 20 seconds or more followed by speech starts a new one.

**Snooze.** The system goes fully silent for a set time. Only "resume" is listened for.

**Scratch.** Deleting the most recent minutes of what you said. It is never mentioned or used again.

**Undo window.** The 10 seconds after "stop" during which "resume" restores the session.

**Condition.** A switch for comparing versions of the experience: full prompting, backchannel only, or silence only.

**Config / settings.** The one list of every timing and audio value. **Hot reload** means a change applies straight away without restarting.

**Narrate mode.** The running plain-English commentary of what the system is doing and why.

**Dry run.** Replaying a written transcript through the engine with no microphone and no sound, to see where the system would speak. Now only in the tests and the terminal tool.

**Accurate transcript.** A second transcription of the whole session, made once when you save, by ElevenLabs' standard (not live) model. It hears each word in context, so it gets more words right.

**Words to listen for (keyterms).** Names and unusual words you list so transcription expects them.

**Fake clock.** A clock that only moves when we tell it to, so tests can check a 20-minute rule instantly.

**Unit test.** A small automatic check of one rule. Open `tests/tests.html` to run them all.


**Browser storage (localStorage).** A small amount of space your browser keeps for a page. Settings are saved there.

**Mermaid.** A text format that turns into a diagram; used for the state diagram in HOW_IT_WORKS.md.

## Added in milestone 2

**Ducking.** Turning the ocean down while you speak, then bringing it back. *Attack* is how fast it goes down (200 ms); *release* is how slowly it comes back (2 s).

**VAD (voice activity detection).** The part that notices when someone is talking, from loudness alone. It doesn't understand words.

**Decibel (dB).** A loudness scale where every 6 dB is roughly double or half. "dB below full scale" counts down from the loudest possible sound (0 dB), so −60 dB is quiet and −20 dB is loud.

**Noise floor.** How loud the room is when nobody is talking. The detector learns it and keeps adjusting it.

**Hysteresis.** Using a higher level to decide speech has started and a lower one to decide it has stopped, so the detector doesn't flicker on and off.

**Hangover.** The short quiet time (0.5 s) the detector waits before saying speech stopped, so gaps between words don't count.

**Gate.** Making the detector less sensitive while the system is speaking, so its own voice doesn't trigger it.

**Loop / crossfade / equal-power.** A *loop* repeats a recording forever. A *crossfade* blends the end into the start so there's no click. *Equal-power* means the blend uses sine and cosine curves so the loudness stays steady through it.

**Web Audio.** The audio system built into Chrome. It mixes sounds and changes volumes with sample-exact timing.

**Audio context / offline audio context.** An audio context is one running instance of Web Audio. An *offline* one computes sound as fast as possible without playing it; the tests use it to measure the mixer.

**Echo cancellation.** A browser feature that tries to remove the sound from your speakers out of the microphone signal.

**Speech synthesis.** The browser's built-in text-to-speech, using your Mac's voices. It's the backup voice when ElevenLabs can't be used.

**IndexedDB.** A small database inside your browser. Your chosen ocean file is kept there.

**Web Worker.** A helper that runs separately from the page. The heartbeat timer lives in one so it keeps time when the tab is in the background.

**Headless browser.** A browser with no window, used to run the tests automatically on my side.

## Added in milestone 3

**Calm technology.** Technology that stays in the background and asks for attention only when it really should. Here it means at least a minute of quiet before the system may speak.

**Speech-to-text (STT) / transcription.** Turning spoken words into written words.

**Partial and final (committed) words.** *Partial* words appear while you're still talking and may change. *Final* words are settled once you stop. Only final words go to the rules.

**Commit.** Telling ElevenLabs "this stretch of speech is finished, give me the final words".

**API key.** A secret password that lets this page use your ElevenLabs account. Anyone who has it can spend your credits.

**Single-use token.** A one-time pass the page gets from ElevenLabs using your key, valid for one connection, so the key itself isn't sent over the live connection.

**WebSocket.** A connection that stays open so audio and words can flow both ways continuously.

**PCM 16 kHz.** Plain digital sound: 16,000 numbers a second, each a 16-bit whole number. The format ElevenLabs expects.

**Base64.** A way to write raw bytes as ordinary text so they can travel inside a message.

**Pre-roll.** The half second of sound kept from just before speech was detected, so your first word isn't clipped.

**Push-to-talk.** Holding a button while you speak, so the system knows for certain that you're talking.

**Mock (pretend) server.** A fake ElevenLabs I ran on my side to test the connection without a real key.

**Situation.** One moment the system can speak in, such as "after a finished thought that sounded like a plan" or "after a prompt got no answer". Each has its own lines on the Wording tab.

**Wording / lines.** The sentences you write for a situation. The system rotates through them.

**Blank (template).** A placeholder like {minutes} inside a line, filled in when it is said ("ten minutes").

**Captured thought.** One finished thought, saved during the session as a reflection, a task or a goal.

**Cue.** A short interface sound: the soft one before a question, and the tiny one when a thought is saved.

**Micro-interaction.** A small, quick response to something you or the system did, like a button pressing in, a captured thought sliding into the list, or a paper boat sailing in when a thought is saved.

*Coming in later milestones:* text-to-speech (ElevenLabs), language model.

## Added with the ElevenLabs voice

**Text-to-speech (TTS).** Turning written lines into spoken audio. ElevenLabs does this in the voice you chose.

**Voice ID.** The code that names one ElevenLabs voice. Yours is U9VgC8Xinl7nnNsyDd3J.

**Model.** Which ElevenLabs speech engine makes the audio. The default, eleven_multilingual_v2, is steady and natural.

**.env file.** A plain text file of secrets, one per line, like `ELEVENLABS_API_KEY=...`. A name starting with a dot is hidden on a Mac.

**In memory only.** Kept while the tab is open and gone when it closes or reloads; never written to the browser's storage.

**Cache (made ahead and kept).** Each line's audio is made once and stored in the browser, so it plays instantly and costs nothing next time.

**After-you-speak sound.** One soft sound that plays once you've been quiet for 5 seconds after speaking, when the ocean is back. If a thought was just saved, its saved tone plays instead.

**Voice detection.** The panel that shows whether speech is being heard right now: a live voice bar, and the line your voice must cross to count as speech.

## Added with the Figma design

**Seascape.** The live drawing of the water and boats on the Session screen. It is drawn about 60 times a second on a canvas (a drawing area in the page).

**Side tab.** The panel on the right of the Session screen with every control, your words, the Captured list and the setup. The button at the top right of the water shows or hides it.

**Crest and trough.** The top and the bottom of a wave. "More variation" means taller waves.

**Audio reactive.** Moving with sound. The waves read how loud your voice (or the ocean) is many times a second and rise or settle with it.

**Tag.** The small label that rises over a new boat saying what happened to that thought.

## Added with sorting

**Natural language processing (NLP) / language processor.** Software that reads the structure of sentences: where they start and end, which words are verbs, whether something is past tense or a question. Here it is "compromise", running in your browser.

**Extraction.** Pulling distinct items (tasks, goals, reflections, concepts, stories, quotes) out of a transcript.

**Prompt.** The written instructions given to an AI model. Yours is in `js/extract-prompt.js`, unchanged.

**Passage.** A stretch of the transcript about one thing, ended by a change of thought, activity or subject.

**Excerpt.** Words copied exactly from the transcript. A *paraphrase* is reworded and is always labelled as one.

**Committed / proposed.** "I need to..." is a committed task; "I could..." is a proposed one.

**Linked items.** Items that belong together, such as a goal and the step toward it, shown by their order numbers.

**Confidence.** How sure the sort is about an item: high, medium or low. Low always comes with a reason.
