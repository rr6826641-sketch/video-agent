"""test_kenburns.py — Chaaron Ken-Burns scene modes (0..3) render hote hain?
Gradient clip + asli Pexels clip dono par. Pan modes (2/3) ka Crop crash regression test."""
import os, glob
import video_maker as vm
from moviepy import VideoFileClip

OUT = os.path.join(vm.CLIPS_DIR, "kbtest")
os.makedirs(OUT, exist_ok=True)


def _render_bg(bg, tag):
    p = os.path.join(OUT, f"kb_{tag}.mp4")
    bg.write_videofile(p, fps=15, codec="libx264", preset="ultrafast",
                       threads=2, audio=False, logger=None)
    bg.close()
    ok = os.path.exists(p) and os.path.getsize(p) > 1000
    print(f"  {tag}: {'OK' if ok else 'FAIL'} ({os.path.getsize(p) if os.path.exists(p) else 0} bytes)")
    return ok


def main():
    fails = []
    print("A) gradient clips (seed 0..3):")
    for seed in range(4):
        try:
            bg = vm.make_gradient_clip(seed, 2.0)
            if not _render_bg(bg, f"grad_{seed}"):
                fails.append(f"grad_{seed}")
        except Exception as e:
            print(f"  grad_{seed}: EXCEPTION {type(e).__name__}: {e}")
            fails.append(f"grad_{seed}")

    # asli pexels clip (agar maujood ho) — fit_clip + all modes
    cand = sorted(glob.glob(os.path.join("clips", "run_*", "clip_00*.mp4")), key=os.path.getsize)
    src = cand[0] if cand else None
    if src:
        print(f"B) video clip ({src}) fit_clip seed 0..3:")
        for seed in range(4):
            try:
                c = VideoFileClip(src)
                bg = vm.fit_clip(c, 2.0, seed)
                if not _render_bg(bg, f"vid_{seed}"):
                    fails.append(f"vid_{seed}")
                c.close()
            except Exception as e:
                print(f"  vid_{seed}: EXCEPTION {type(e).__name__}: {e}")
                fails.append(f"vid_{seed}")
    else:
        print("B) koi pexels clip nahi mila — skip")

    if fails:
        print(f"\nFAILED: {fails}")
        raise SystemExit(1)
    print("\nALL KEN-BURNS MODES OK")


if __name__ == "__main__":
    main()
