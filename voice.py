"""voice.py — Edge-TTS se free neural voiceover + per-sentence audio files.
Upgrade: sentences ke beech configurable pause (config: pause_between_sentences).
"""
import asyncio, json, os
import numpy as np
import edge_tts
from moviepy import AudioFileClip, AudioArrayClip, concatenate_audioclips

CFG = json.load(open("config.json", encoding="utf-8"))
AUDIO_DIR = "audio"
os.makedirs(AUDIO_DIR, exist_ok=True)
PAUSE = float(CFG.get("pause_between_sentences", 0.25))


async def _tts(text, voice, path):
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(path)


def synthesize(sentences, voice=None, prefix="v"):
    """Har sentence ka mp3 banata hai. Return: list of (path, duration_seconds)."""
    voice = voice or (CFG.get("urdu_voice") if CFG["language"].lower() == "urdu" else CFG.get("voice", "en-US-GuyNeural"))
    result = []
    for i, sent in enumerate(sentences):
        path = os.path.join(AUDIO_DIR, f"{prefix}_{i:03d}.mp3")
        asyncio.run(_tts(sent, voice, path))
        # IMPORTANT: duration read ke baad clip ko force-close karo, warna har sentence
        # ke liye ek FFMPEG subprocess leak hota hai -> WinError 1455 (paging file too small)
        _clip = AudioFileClip(path)
        try:
            duration = _clip.duration
        finally:
            _clip.close()
        result.append((path, duration))
        print(f"    voice {i+1}/{len(sentences)} ok ({duration:.1f}s)")
    return result


def _silence(duration, fps):
    """Khali (silent) audio clip — sentences ke beech pause ke liye."""
    if duration <= 0:
        return None
    samples = np.zeros((max(1, int(duration * fps)), 2), dtype="float32")
    return AudioArrayClip(samples, fps=fps)


def merge_voiceover(audio_files, out_path="audio/voiceover.mp3", pause=None):
    """Saare sentence audios + pauses = ek voiceover.mp3.
    Memory-safe: har file EK WAQT mein decode hoti hai — 120 files ke liye
    120 concurrent ffmpeg processes NAHI khulte (WinError 1455 fix).
    Return: (path, total_duration_seconds_with_pauses)."""
    pause = PAUSE if pause is None else float(pause)
    fps = 44100
    pause_samples = max(0, int(pause * fps))
    parts = []
    total = 0.0
    for i, (p, d) in enumerate(audio_files):
        c = AudioFileClip(p)
        try:
            arr = c.to_soundarray(fps=fps)   # float32 (N, ch)
        finally:
            c.close()
        if arr.ndim == 1:
            arr = np.repeat(arr[:, None], 2, axis=1)
        elif arr.shape[1] == 1:
            arr = np.repeat(arr, 2, axis=1)
        parts.append(arr)
        total += d
        if pause > 0 and i < len(audio_files) - 1:
            parts.append(np.zeros((pause_samples, arr.shape[1]), dtype="float32"))
            total += pause
    full = np.concatenate(parts, axis=0)
    joined = AudioArrayClip(full, fps=fps)
    joined.write_audiofile(out_path, fps=fps, logger=None)
    return out_path, total


if __name__ == "__main__":
    test = synthesize(["Hello! Ye voiceover test hai. Sab theek chal raha hai!"], prefix="test")
    print("Test ok:", test)