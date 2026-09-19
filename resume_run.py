"""resume_run.py — 10-min history video resume (voiceover reuse, no Gemini/TTS).

Upgrade v3 (19 Sep 2026):
  * Voiceover reuse: sabse naya voiceover_v*.mp3 + uske per-sentence files
    (silence-split ka unreliable mp3 check bypass — durations cached JSON se).
  * Clip/segment crash-resume: purane run ka partial clips/subs reuse.
  * Render retry: MoviePy MemoryError par 2 attempts (known 08:08 fail -> 08:48 success).
"""
import json, os, sys, datetime, traceback, glob

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import script_maker, video_maker

CFG = json.load(open("config.json", encoding="utf-8"))
LOG_PATH = os.path.join("logs", "resume_run.log")
DUR_CACHE = os.path.join("data", "vo_durations.json")


def log(m):
    line = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {m}"
    print(m, flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def newest_voiceover():
    """Sabse naya audio/voiceover_v*.mp3 (matched segment files ke saath)."""
    cands = sorted(glob.glob(os.path.join("audio", "voiceover_v*.mp3")),
                   key=os.path.getmtime, reverse=True)
    for vo in cands:
        prefix = os.path.basename(vo)[len("voiceover_"):-4]
        segs = glob.glob(os.path.join("audio", f"{prefix}_*.mp3"))
        if len(segs) >= 10:  # genuine per-sentence run (not stray file)
            return vo, prefix
    return (cands[0], None) if cands else (None, None)


def cached_durations(script_data):
    """data/vo_durations.json se durations (title binding check ke saath)."""
    if not os.path.exists(DUR_CACHE):
        return None
    try:
        rec = json.load(open(DUR_CACHE, encoding="utf-8"))
    except Exception:
        return None
    if rec.get("script_title") != script_data["title"]:
        print(f"    [!] duration cache title mismatch — ignore")
        return None
    durs = rec.get("durations", [])
    if len(durs) != len(script_data["sentences"]):
        print(f"    [!] duration cache count mismatch ({len(durs)})")
        return None
    return durs


def read_segment_durations(prefix, n):
    """Per-sentence mp3 files se durations (fallback — slow, har file ffmpeg khulta hai)."""
    from moviepy import AudioFileClip
    durs = []
    for i in range(n):
        p = os.path.join("audio", f"{prefix}_{i:03d}.mp3")
        if not os.path.exists(p):
            return None
        c = AudioFileClip(p)
        try:
            durs.append(c.duration)
        finally:
            c.close()
        if (i + 1) % 25 == 0:
            print(f"    segment durations {i + 1}/{n}", flush=True)
    return durs


def main():
    log("=" * 50)
    log(f"RESUME RUN v3 — {datetime.datetime.now().strftime('%d %b %Y %H:%M:%S')}")
    log("=" * 50)

    n = int(CFG.get("sentences_per_video", 120))
    log("[1/6] Script (fallback, no Gemini)...")
    script_data = script_maker.build_fallback(n)
    log(f"    Topic: {script_data['topic']}")
    log(f"    Title: {script_data['title']}")
    log(f"    Sentences: {len(script_data['sentences'])}")

    log("[2/6] Voiceover reuse (naya version, no TTS)...")
    vo, prefix = newest_voiceover()
    audio_files = None
    if vo:
        log(f"    Found: {os.path.basename(vo)}")
        durs = cached_durations(script_data)
        if durs is None and prefix:
            durs = read_segment_durations(prefix, len(script_data["sentences"]))
        if durs and len(durs) == len(script_data["sentences"]):
            audio_files = [(os.path.join("audio", f"{prefix}_{i:03d}.mp3"), d)
                           for i, d in enumerate(durs)]
            log(f"    Reuse OK: {len(audio_files)} segments ({prefix}), total {sum(durs):.1f}s")
        else:
            log("    [!] durations verify fail — TTS re-run")
            audio_files = None

    if audio_files is None:
        import voice
        log("    TTS voiceover ban raha hai (Edge-TTS)...")
        af = voice.synthesize(script_data["sentences"], prefix="v" + datetime.datetime.now().strftime("%H%M%S"))
        vo, _ = voice.merge_voiceover(af, out_path=f"audio/voiceover_{datetime.datetime.now().strftime('%H%M%S')}.mp3")
        audio_files = af

    total_dur = sum(d + (float(CFG.get("pause_between_sentences", 0.25)) if i < len(audio_files) - 1 else 0.0)
                    for i, (_, d) in enumerate(audio_files))
    log(f"    Total video duration (with pauses): {total_dur:.1f}s")

    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join("output", f"final_{ts}.mp4")
    info = dict(script_data)
    info["duration_seconds"] = round(total_dur)
    info["video_file"] = out_path
    info["voiceover_file"] = vo
    info["created"] = datetime.datetime.now().isoformat()
    json.dump(info, open("last_video_info.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    # Purane run ka partial clips dir (reuse) — sabse naya jisme clip files hon
    clips_dir = None
    run_dirs = sorted(glob.glob(os.path.join("clips", "run_*")), key=os.path.getmtime, reverse=True)
    for rd in run_dirs:
        clips = [f for f in os.listdir(rd) if f.startswith("clip_") and f.endswith(".mp4")]
        if clips:
            clips_dir = rd
            log(f"    Crash-resume: {len(clips)} clips reuse ({os.path.basename(rd)})")
            break

    log(f"[3/6] Render start (clips download + segments)... -> {out_path}")
    last_err = None
    for attempt in range(1, 3):  # MoviePy MemoryError recovery: 2 attempts
        try:
            video_path = video_maker.make_video(script_data, audio_files, vo,
                                                out_path=out_path, clips_dir=clips_dir)
            break
        except Exception as e:
            last_err = e
            log(f"    [!] Render attempt {attempt} fail: {e}")
            log("    Retrying (clips cached -> fast recovery)...")
    else:
        log("[!] Render 2 attempts ke baad bhi fail:")
        log(traceback.format_exc())
        sys.exit(1)

    info["video_file"] = video_path
    info["created"] = datetime.datetime.now().isoformat()
    json.dump(info, open("last_video_info.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    log("=" * 50)
    log(f"VIDEO READY: {video_path}")
    log("Upload NAHI kiya — user confirmation pending (UI ya python uploader.py).")
    log("=" * 50)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        log("[!] Resume run error:")
        log(traceback.format_exc())
        sys.exit(1)