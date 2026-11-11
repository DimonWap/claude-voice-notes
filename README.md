# voice-notes

A Claude Code mod that reads out the key points of Claude's answers. When a turn ends, Haiku decides whether the answer holds something you should hear: a result, an error, a question, or a decision you need to make. If it does, Haiku sums it up in one or two short spoken sentences in Russian, and a neural voice from `edge-tts` reads them aloud. Short or in-between answers are not read. A new phrase stops the one still playing, so phrases never overlap.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install voice-notes --marketplace DimonWap/claude-voice-notes
```

Answer `y` to add the marketplace, then choose a scope.

From a shell:

```bash
claude plugin install voice-notes --marketplace DimonWap/claude-voice-notes
```

## Requirements

- Python 3 on `PATH` (`python`), with `edge-tts`: `pip install edge-tts`
- `ffplay` from FFmpeg on `PATH`, or its full path in the `VOICE_NOTES_FFPLAY` environment variable
- Without network access or `edge-tts`, the mod falls back to Windows SAPI (the Irina voice) on Windows

## Commands

| Command | What it does |
| --- | --- |
| `/voicenotes on` / `off` | Turn reading on or off |
| `/voicenotes svetlana` / `dmitry` | Choose the voice (`ru-RU-SvetlanaNeural` or `ru-RU-DmitryNeural`) |
| `/voicenotes test` | Speak a test phrase |
| `/voicenotes python <cmd>` | Set the interpreter, for example `/voicenotes python python3` |
| `/voicenotes` | Show the current state |

## Notes

- Each spoken summary is one extra Haiku call, billed to your Claude account.
- The helper writes a short run log to `cc-voice-notes.log` in the system temp folder.

## License

MIT, see [LICENSE](LICENSE).
