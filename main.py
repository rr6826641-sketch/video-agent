"""main.py — Video Agent v2: script -> voice -> clips -> edit -> (upload)
Run:
    python main.py                      (1 video banao + upload agar config mein on hai)
    python main.py --no-upload          (sirf banao, upload nahi)
    python main.py --count 3            (3 videos ek saath)
    python main.py --topic "ocean facts" (khaas topic pe banao)
    python main.py --language Urdu      (language override)
    python main.py --no-cleanup         (clips folder delete mat karo)
    python main.py --out "my.mp4"       (output file ka naam)
"""
import json, os, sys, time, traceback, datetime

# Windows console (cp1252) emoji/unicode par crash karta hai — UTF-8 force karo
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import script_maker, voice, video_maker

LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

CFG = json.load(open("config.json", encoding="utf-8"))
AUTO_UPLOAD = bool(CFG.get("upload_automatically", True))


def log(msg):
    line = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}"
    try:
        print(msg, flush=True)
    except Exception:
        pass  # console band/pipe toot gaya to sirf file mein log rahega
    with open(os.path.join(LOG_DIR, "run.log"), "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def build_one(upload_enabled=True, topic=None, out_path=None, cleanup=True, niche=None):
    log("=" * 50)
    log(f"VIDEO AGENT v2 — {datetime.datetime.now().strftime('%d %b %Y %H:%M')}")
    log("=" * 50)

    log("[1/6] Script likhi ja rahi hai (Gemini)...")
    script_data = script_maker.make_script(topic, niche=niche)
    log(f"    Topic: {script_data.get('topic', '?')}")
    log(f"    Title: {script_data.get('title', '?')}")

    log("[2/6] Voiceover ban raha hai (Edge-TTS free neural voice)...")
    prefix = "v" + datetime.datetime.now().strftime("%H%M%S")
    audio_files = voice.synthesize(script_data["sentences"], prefix=prefix)
    total_dur = sum(d for _, d in audio_files)
    log(f"    Total voiceover: {total_dur:.0f} seconds")

    log("[3/6] Voiceover merge ho raha hai...")
    voiceover_path, voicedur = voice.merge_voiceover(audio_files, out_path=f"audio/voiceover_{prefix}.mp3")
    log(f"    Voiceover (with pauses): {voicedur:.0f} seconds")

    target_min = CFG.get("target_duration_minutes")
    if target_min and voicedur < target_min * 60 * 0.95:
        log(f"    [!] Warning: video sirf {voicedur:.0f}s hai — target {target_min} min se kam. sentences_per_video badhao ya dobara run karo.")

    if not out_path:
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = os.path.join("output", f"final_{ts}.mp4")

    import gc
    video_path = None
    for attempt in range(2):
        try:
            video_path = video_maker.make_video(script_data, audio_files, voiceover_path, out_path=out_path)
            break
        except MemoryError:
            log(f"    [!] Render memory error (attempt {attempt + 1}/2) — dobara try...")
            gc.collect()
            time.sleep(8)
        except Exception as _e:
            if "MemoryError" in repr(_e) and attempt == 0:
                log(f"    [!] Render memory error (attempt {attempt + 1}/2) — dobara try...")
                gc.collect()
                time.sleep(8)
                continue
            raise
    if not video_path:
        raise RuntimeError("[!] Render 2 attempts ke baad bhi fail — machine memory kam ho sakti hai")
    log(f"    Video ready: {video_path}")

    # info save (uploader + record ke liye)
    info = dict(script_data)
    info["duration_seconds"] = round(voicedur)
    info["video_file"] = video_path
    info["created"] = datetime.datetime.now().isoformat()
    json.dump(info, open("last_video_info.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    # per-sentence voice mp3s ab redundant hain (voiceover+mix ban chuka) — disk saaf
    for p, _ in audio_files:
        try:
            os.remove(p)
        except Exception:
            pass

    if upload_enabled:
        log("[UPLOAD] YouTube par ja raha hai...")
        try:
            import uploader
            url = uploader.upload(video_path, script_data)
            info["youtube_url"] = url
            json.dump(info, open("last_video_info.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        except Exception as e:
            log(f"    [!] Upload fail: {e}")
            log("    client_secrets.json setup karo (README Step 3), phir 'python uploader.py' se dobara try karo")
    else:
        log(f"[UPLOAD] Skip — confirmation pending. Video check karo: {video_path}")
        log("    Theek ho to 'python uploader.py' chalao (thumbnail ke saath upload hoga)")

    # cleanup clips to save disk (sirf agar flag na diya ho) — per-run subfolders bhi
    if cleanup and os.path.isdir("clips"):
        deleted = 0
        for f in os.listdir("clips"):
            try:
                p = os.path.join("clips", f)
                if os.path.isdir(p):
                    import shutil
                    shutil.rmtree(p, ignore_errors=True)
                else:
                    os.remove(p)
                deleted += 1
            except Exception:
                pass
        log(f"    clips cleaned ({deleted} entries)")
    log("DONE! ✅")


def parse_args(argv):
    opts = {
        "upload_enabled": ("--no-upload" not in argv) and AUTO_UPLOAD,
        "count": 1,
        "topic": None,
        "language": None,
        "cleanup": "--no-cleanup" not in argv,
        "out": None,
    }
    if "--count" in argv:
        idx = argv.index("--count")
        if idx + 1 >= len(argv):
            print("[!] --count ke baad number do, e.g. --count 3")
            sys.exit(1)
        try:
            opts["count"] = max(1, min(10, int(argv[idx + 1])))
        except ValueError:
            print("[!] --count ke baad sahih number do, e.g. --count 3")
            sys.exit(1)
    if "--topic" in argv:
        idx = argv.index("--topic")
        if idx + 1 < len(argv) and not argv[idx + 1].startswith("--"):
            opts["topic"] = argv[idx + 1]
        else:
            print("[!] --topic ke baad topic do, e.g. --topic \"ocean facts\"")
            sys.exit(1)
    opts["niche"] = None
    if "--niche" in argv:
        idx = argv.index("--niche")
        if idx + 1 < len(argv) and not argv[idx + 1].startswith("--"):
            opts["niche"] = argv[idx + 1]
        else:
            print("[!] --niche ke baad niche do, e.g. --niche \"dark history facts\"")
            sys.exit(1)
    if "--language" in argv:
        idx = argv.index("--language")
        if idx + 1 < len(argv) and not argv[idx + 1].startswith("--"):
            opts["language"] = argv[idx + 1]
    if "--out" in argv:
        idx = argv.index("--out")
        if idx + 1 < len(argv) and not argv[idx + 1].startswith("--"):
            opts["out"] = argv[idx + 1]
    return opts


if __name__ == "__main__":
    opts = parse_args(sys.argv[1:])
    if not AUTO_UPLOAD:
        print("    config: upload_automatically=false -> sirf video banegi, upload nahi")
    if opts["language"]:
        import json as _json
        with open("config.json", encoding="utf-8") as fh:
            _cfg = _json.load(fh)
        _cfg["language"] = opts["language"]
        _json.dump(_cfg, open("config.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        print(f"    language set: {opts['language']}")

    for i in range(opts["count"]):
        log(f"--- Video {i + 1}/{opts['count']} ---")
        try:
            build_one(opts["upload_enabled"], topic=opts["topic"], out_path=opts["out"],
                      cleanup=opts["cleanup"], niche=opts.get("niche"))
        except SystemExit:
            raise
        except Exception:
            log("[!] Video banate waqt error:")
            tb = traceback.format_exc()
            try:
                traceback.print_exc()
            except Exception:
                pass
            with open(os.path.join(LOG_DIR, "run.log"), "a", encoding="utf-8") as fh:
                fh.write(tb + "\n")