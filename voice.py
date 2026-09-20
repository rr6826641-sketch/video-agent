"""voice.py — Edge-TTS se free neural voiceover + per-sentence audio files.
Upgrade: sentences ke beech configurable pause (config: pause_between_sentences).

v3 hardening (crash fix):
  * edge-tts fail hone par 0-byte / missing mp3 banti thi -> AudioFileClip crash
    ("Error passing `ffmpeg -i` command output"). Ab har file validate + retry hoti hai.
  * Agar kisi sentence ki TTS phir bhi fail ho -> us sentence ke liye estimated-duration
    SILENT clip bana di jati hai, taake poora pipeline na ruke.
  * _safe_duration(): duration read bhi crash-proof (file missing/corrupt ho to fallback).
"""
import asyncio, json, os
import numpy as np
import edge_tts
from moviepy import AudioFileClip, AudioArrayClip, concatenate_audioclips

CFG = json.load(open("config.json", encoding="utf-8"))
AUDIO_DIR = "audio"
os.makedirs(AUDIO_DIR, exist_ok=True)
PAUSE = float(CFG.get("pause_between_sentences", 0.25))

TTS_RETRIES = int(CFG.get("tts_retries", 3))
MIN_BYTES = 200          # 200 bytes se choti mp3 = kharab/khali file
FPS = 44100


# ---------------------------------------------------------------- helpers
def _valid_audio(path):
    """File maujood hai + non-empty + ffmpeg decode kar sakta hai?"""
    if not path or not os.path.exists(path) or os.path.getsize(path) < MIN_BYTES:
        return False
    try:
        c = AudioFileClip(path)
        try:
            return bool(c.duration and c.duration > 0.01)
        finally:
            c.close()
    except Exception:
        return False


def _safe_duration(path, fallback=0.0):
    """Crash-proof duration read. Kharab file -> fallback seconds."""
    try:
        c = AudioFileClip(path)
        try:
            d = c.duration
            return float(d) if d and d > 0 else fallback
        finally:
            c.close()
    except Exception:
        return fallback


def _estimate_duration(text):
    """edge-tts ~15 chars/sec — silent fallback ki lambai.""" 
    return max(1.0, len(text) / 15.0)


def _write_silence(path, duration, fps=FPS):
    """Silent mp3 banao (fallback jab TTS na chale)."""
    samples = np.zeros((max(1, int(duration * fps)), 2), dtype="float32")
    clip = AudioArrayClip(samples, fps=fps)
    try:
        clip.write_audiofile(path, fps=fps, logger=None, codec="libmp3lame")
    finally:
        clip.close()
    return path


async def _tts(text, voice, path):
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(path)


def _tts_with_retry(text, voice, path):
    """TTS ko TTS_RETRIES baar try karo. True = valid file bani."""
    for attempt in range(1, TTS_RETRIES + 1):
        try:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass
            asyncio.run(_tts(text, voice, path))
            if _valid_audio(path):
                return True
            print(f"    [!] tts attempt {attempt}: file kharab/khali ({text[:40]}...)")
        except Exception as e:
            print(f"    [!] tts attempt {attempt} fail: {e}")
        try:
            asyncio.sleep(0)  # cooperative yield, sync context
        except Exception:
            pass
    return False


# ---------------------------------------------------------------- synthesize
def synthesize(sentences, voice=None, prefix="v"):
    """Har sentence ka mp3 banata hai. Return: list of (path, duration_seconds).
    Crash-proof: kharab/khali sentence -> silent fallback (pipeline rukti nahi)."""
    voice = voice or (CFG.get("urdu_voice") if CFG["language"].lower() == "urdu" else CFG.get("voice", "en-US-GuyNeural"))
    result = []
    for i, sent in enumerate(sentences):
        sent = (sent or "").strip()
        path = os.path.join(AUDIO_DIR, f"{prefix}_{i:03d}.mp3")
        ok = False
        if sent:
            ok = _tts_with_retry(sent, voice, path)
        if not ok:
            dur = _estimate_duration(sent or " ") if sent else 1.0
            print(f"    [!] voice {i+1}: TTS fail -> silent fallback ({dur:.1f}s)")
            _write_silence(path, dur)
        duration = _safe_duration(path, fallback=_estimate_duration(sent) if sent else 1.0)
        result.append((path, duration))
        print(f"    voice {i+1}/{len(sentences)} ok ({duration:.1f}s)")
    return result


def _silence(duration, fps=FPS):
    """Khali (silent) audio clip — sentences ke beech pause ke liye."""
    if duration <= 0:
        return None
    samples = np.zeros((max(1, int(duration * fps)), 2), dtype="float32")
    return AudioArrayClip(samples, fps=fps)


# ---------------------------------------------------------------- merge
def merge_voiceover(audio_files, out_path="audio/voiceover.mp3", pause=None):
    """Saare sentence audios + pauses = ek voiceover.mp3.
    Memory-safe: har file EK WAQT mein decode hoti hai — 120 files ke liye
    120 concurrent ffmpeg processes NAHI khulte (WinError 1455 fix).
    Crash-proof: kharab file -> silent placeholder (poora render na ruke).
    Return: (path, total_duration_seconds_with_pauses)."""
    pause = PAUSE if pause is None else float(pause)
    fps = FPS
    pause_samples = max(0, int(pause * fps))
    parts = []
    total = 0.0
    for i, (p, d) in enumerate(audio_files):
        arr = None
        if _valid_audio(p):
            try:
                c = AudioFileClip(p)
                try:
                    arr = c.to_soundarray(fps=fps)   # float32 (N, ch)
                finally:
                    c.close()
            except Exception as e:
                print(f"    [!] merge: '{p}' decode fail ({e}) -> silence")
                arr = None
        else:
            print(f"    [!] merge: '{p}' missing/kharab -> silence fallback")
        if arr is None:
            # silent placeholder (duration d, fallback estimate)
            dur = float(d) if d and d > 0 else 1.0
            arr = np.zeros((max(1, int(dur * fps)), 2), dtype="float32")
        if arr.ndim == 1:
            arr = np.repeat(arr[:, None], 2, axis=1)
        elif arr.shape[1] == 1:
            arr = np.repeat(arr, 2, axis=1)
        parts.append(arr)
        total += d if d else (arr.shape[0] / fps)
        if pause > 0 and i < len(audio_files) - 1:
            parts.append(np.zeros((pause_samples, arr.shape[1]), dtype="float32"))
            total += pause
    if not parts:
        raise ValueError("merge_voiceover: koi audio file nahi mili")
    full = np.concatenate(parts, axis=0)
    joined = AudioArrayClip(full, fps=fps)
    try:
        joined.write_audiofile(out_path, fps=fps, logger=None)
    finally:
        joined.close()
    return out_path, total


if __name__ == "__main__":
    test = synthesize(["Hello! Ye voiceover test hai. Sab theek chal raha hai!"], prefix="test")
    print("Test ok:", test)