"""Speak text from stdin: edge-tts neural voice, Windows SAPI (Irina) as offline fallback.

Usage: python speak.py [voice] < text
A new call stops the previous playback so answers never talk over each other.
"""
import asyncio
import os
import subprocess
import sys
import tempfile

TMP = tempfile.gettempdir()
PID_FILE = os.path.join(TMP, "cc-voice-notes.pid")
LOG_FILE = os.path.join(TMP, "cc-voice-notes.log")
# ffplay from PATH, or the full path in the VOICE_NOTES_FFPLAY environment variable.
FFPLAY = os.environ.get("VOICE_NOTES_FFPLAY", "ffplay")


def log(msg: str) -> None:
    try:
        import datetime
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{datetime.datetime.now():%H:%M:%S} {msg}\n")
    except OSError:
        pass


def stop_previous() -> None:
    try:
        with open(PID_FILE, encoding="ascii") as f:
            pid = f.read().strip()
        if pid:
            subprocess.run(["taskkill", "/PID", pid, "/T", "/F"],
                           capture_output=True, check=False)
    except OSError:
        pass


def play(argv, stdin_text=None) -> None:
    proc = subprocess.Popen(argv, stdin=subprocess.PIPE if stdin_text else None,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            text=True, encoding="utf-8")
    with open(PID_FILE, "w", encoding="ascii") as f:
        f.write(str(proc.pid))
    if stdin_text:
        proc.communicate(stdin_text)
    else:
        proc.wait()


def sapi(text: str) -> None:
    ps = ("[Console]::InputEncoding=[Text.Encoding]::UTF8;"
          "Add-Type -AssemblyName System.Speech;"
          "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
          "try{$s.SelectVoice('Microsoft Irina Desktop')}catch{};"
          "$s.Speak([Console]::In.ReadToEnd())")
    play(["powershell", "-NoProfile", "-Command", ps], stdin_text=text)


def synthesize(text: str, voice: str, out: str, attempts: int = 3) -> bool:
    """edge-tts with retries: its service sometimes answers NoAudioReceived once and works the next time."""
    try:
        import edge_tts
    except ImportError as exc:
        log(f"edge-tts not installed, SAPI fallback: {exc!r}")
        return False
    import time
    for n in range(1, attempts + 1):
        try:
            asyncio.run(edge_tts.Communicate(text, voice, rate="+10%").save(out))
            if os.path.exists(out) and os.path.getsize(out) > 0:
                return True
            log(f"edge-tts attempt {n}: empty file")
        except Exception as exc:
            log(f"edge-tts attempt {n} failed: {exc!r}")
        time.sleep(0.7 * n)
    log("edge-tts gave up, SAPI fallback")
    return False


def main() -> None:
    sys.stdin.reconfigure(encoding="utf-8")
    text = sys.stdin.read().strip()
    if not text:
        return
    voice = sys.argv[1] if len(sys.argv) > 1 else "ru-RU-SvetlanaNeural"
    stop_previous()
    out = os.path.join(TMP, f"cc-voice-notes-{os.getpid()}.mp3")
    try:
        if not synthesize(text, voice, out):
            sapi(text)
            return
        play([FFPLAY, "-nodisp", "-autoexit", "-loglevel", "quiet", out])
    finally:
        try:
            os.remove(out)
        except OSError:
            pass


if __name__ == "__main__":
    log(f"start argv={sys.argv[1:]}")
    try:
        main()
        log("done")
    except Exception as exc:
        log(f"error: {exc!r}")
        raise
