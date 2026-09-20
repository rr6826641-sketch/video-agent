"""resume_livetest.py — Livetest ko wahin se resume karo jahan crash hua tha.

Purane run ke 10 Pexels clips + voiceover reuse karta hai (NO re-download/TTS),
sirf bache hue segments ko FIXED code se render karta hai -> final mp4.

Usage: python resume_livetest.py [clips_run_dir]
"""
import glob, json, os, sys, datetime, traceback
from moviepy import AudioFileClip

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import script_maker, video_maker

CFG = json.load(open("config.json", encoding="utf-8"))
LOG = os.path.join("logs", "resume_livetest.log")
OUT = "output/livetest_bushcraft.mp4"


def log(m):
    line = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {m}"
    print(m, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def pick_clips_dir(arg=None):
    if arg and os.path.isdir(arg):
        return arg
    for rd in sorted(glob.glob(os.path.join("clips", "run_*")), key=os.path.getmtime, reverse=True):
        if glob.glob(os.path.join(rd, "clip_*.mp4")):
            return rd
    return None


def newest_voiceover():
    for vo in sorted(glob.glob(os.path.join("audio", "voiceover_v*.mp3")),
                     key=os.path.getmtime, reverse=True):
        prefix = os.path.basename(vo)[len("voiceover_"):-4]
        segs = sorted(glob.glob(os.path.join("audio", f"{prefix}_*.mp3")))
        if len(segs) >= 6:
            return vo, prefix, segs
    return None, None, []


def main():
    log("=" * 50)
    log(f"RESUME LIVETEST — {datetime.datetime.now().strftime('%d %b %Y %H:%M:%S')}")
    log("=" * 50)

    clips_dir = pick_clips_dir(sys.argv[1] if len(sys.argv) > 1 else None)
    if not clips_dir:
        log("[!] Koi clips run dir nahi mili")
        sys.exit(1)
    nclips = len(glob.glob(os.path.join(clips_dir, "clip_*.mp4")))
    log(f"    Clips dir: {clips_dir} ({nclips} clips)")

    n = nclips  # sentences = clips count
    script_data = script_maker.build_fallback(n)
    log(f"    Title: {script_data['title']}")
    log(f"    Sentences: {len(script_data['sentences'])}")

    vo, prefix, segs = newest_voiceover()
    if not vo or len(segs) < 1:
        log("[!] Koi voiceover/segments nahi mila")
        sys.exit(1)
    if len(segs) < n:
        log(f"[i] Clips {n} > voiceover segs {len(segs)} -> {len(segs)} sentences render honge")
        n = len(segs)
        script_data = script_maker.build_fallback(n)
        log(f"    Title: {script_data['title']}")
        log(f"    Sentences: {len(script_data['sentences'])}")
    log(f"    Voiceover reuse: {os.path.basename(vo)} (+{len(segs)} sentence mp3)")

    audio_files = []
    for i in range(n):
        p = os.path.join("audio", f"{prefix}_{i:03d}.mp3")
        c = AudioFileClip(p)
        try:
            d = c.duration
        finally:
            c.close()
        audio_files.append((p, d))
    total_dur = sum(d + (0.25 if i < n - 1 else 0.0) for i, (_, d) in enumerate(audio_files))
    log(f"    Total video duration (with pauses): {total_dur:.1f}s")

    os.makedirs("output", exist_ok=True)
    try:
        video_path = video_maker.make_video(script_data, audio_files, vo,
                                            out_path=OUT, clips_dir=clips_dir)
    except Exception:
        log("[!] Render fail:")
        log(traceback.format_exc())
        sys.exit(1)
    log("=" * 50)
    log(f"VIDEO READY: {video_path}")
    log("=" * 50)


if __name__ == "__main__":
    main()
