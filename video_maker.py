"""video_maker.py — Pexels clips + voiceover + subtitles + music = CapCut-jaisi video.
Upgrade v2:
  * caption_style "wordpop" — word-by-word karaoke highlight (viral shorts style)
  * caption_style "static"  — purana poora-sentence caption
  * progress_bar          — top par yellow progress bar
  * ken_burns             — clips par slow pan (motion feel)
  * fade                  — audio/video fade polish
  * thumbnail             — title text overlay ke saath
"""
import json, os, random, textwrap, time
import requests
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from moviepy import (VideoFileClip, AudioFileClip, ImageClip, CompositeVideoClip,
                     concatenate_videoclips, CompositeAudioClip)
from moviepy.video.fx import FadeIn, FadeOut
from moviepy.audio.fx import AudioFadeIn, AudioFadeOut

CFG = json.load(open("config.json", encoding="utf-8"))
W, H = CFG["resolution"]
LANDSCAPE = H < W
ORIENT = "landscape" if LANDSCAPE else "portrait"
# Har run ka apna clips subfolder — concurrent runs ke files ek dusre ki overwrite nahi karte
CLIPS_DIR = os.path.join("clips", "run_" + time.strftime("%Y%m%d_%H%M%S"))
os.makedirs(CLIPS_DIR, exist_ok=True)

PAUSE = float(CFG.get("pause_between_sentences", 0.25))
CAPTION_STYLE = str(CFG.get("caption_style", "static")).lower()
WORDS_PER_GROUP = max(1, int(CFG.get("caption_words_per_group", 3)))
SHOW_PROGRESS = bool(CFG.get("progress_bar", True))
KEN_BURNS = bool(CFG.get("ken_burns", True))
FADE = bool(CFG.get("fade", True))
ACTIVE_COLOR = "#FFD400"
FONT_SIZE = max(46, min(110, int(64 * W / 1080)))   # 1080-wide → 64, 1920-wide → 110
SUB_MARGIN = 90 if LANDSCAPE else 330               # captions neeche ka gap
_bar_cache = {}


def find_font():
    for f in [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\arial.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"]:
        if os.path.exists(f):
            return f
    return None


def _font(size=FONT_SIZE):
    fp = find_font()
    if fp:
        return ImageFont.truetype(fp, size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


# ---------------------------------------------------------------- subtitles
def render_subtitle(text, font_size=FONT_SIZE):
    """Static caption: poora sentence, white text + black outline."""
    font = _font(font_size)
    wrapped = textwrap.fill(text, width=24)
    img = Image.new("RGBA", (W - 80, 500), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    y = 10
    for line in wrapped.split("\n"):
        bbox = draw.textbbox((0, 0), line, font=font)
        draw.text((10, y), line, font=font, fill="white",
                  stroke_width=6, stroke_fill="black")
        y += (bbox[3] - bbox[1]) + int(font_size * 0.45)
    final = img.crop((0, 0, W - 80, min(y + 20, 500)))
    return final


def render_wordpop(words, active_idx, font_size=FONT_SIZE):
    """Word-by-word caption: active word yellow, baqi white, centered."""
    font = _font(font_size)
    maxw = W - 100
    space_w = font.getlength(" ")

    # wrap into lines (per word)
    lines, cur, cur_w = [], [], 0
    for w in words:
        ww = font.getlength(w)
        if cur and cur_w + space_w + ww > maxw:
            lines.append(cur)
            cur, cur_w = [], 0
        cur.append(w)
        cur_w += ww + (space_w if cur else 0)
    if cur:
        lines.append(cur)

    line_h = int(font_size * 1.32)
    height = len(lines) * line_h + 24
    img = Image.new("RGBA", (maxw + 20, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def line_layout(line_words):
        tw = sum(font.getlength(w) for w in line_words) + space_w * (len(line_words) - 1)
        return (maxw - tw) / 2 + 10

    # pehle non-active white (neechay), phir active yellow (upar) — stroke overlap se bachne ke liye
    idx = 0
    for li, line_words in enumerate(lines):
        x = line_layout(line_words)
        y = 12 + li * line_h
        for w in line_words:
            if idx != active_idx:
                draw.text((x, y), w, font=font, fill="white",
                          stroke_width=5, stroke_fill="black")
            x += font.getlength(w) + space_w
            idx += 1
    idx = 0
    for li, line_words in enumerate(lines):
        x = line_layout(line_words)
        y = 12 + li * line_h
        for w in line_words:
            if idx == active_idx:
                draw.text((x, y), w, font=font, fill=ACTIVE_COLOR,
                          stroke_width=5, stroke_fill="black")
            x += font.getlength(w) + space_w
            idx += 1
    return img


# ------------------------------------------------------------ progress bar
def progress_bar_png(frac):
    """Top progress bar PNG (cached by percent)."""
    pct = int(round(max(0.0, min(1.0, frac)) * 100))
    if pct in _bar_cache:
        return _bar_cache[pct]
    th = 12
    img = Image.new("RGBA", (W, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W - 1, th - 1], fill=(0, 0, 0, 150))
    fw = int((W - 4) * pct / 100)
    if fw > 0:
        d.rectangle([2, 2, fw + 2, th - 3], fill=ACTIVE_COLOR)
    p = os.path.join(CLIPS_DIR, f"bar_{pct:03d}.png")
    img.save(p)
    _bar_cache[pct] = p
    return p


# ------------------------------------------------------------------- clips
def _kenburns(clip, duration):
    """Slow pan/zoom feel: clip ko 6% bara karo aur halka sa move karo."""
    if not (KEN_BURNS and duration >= 1.5):
        return clip.with_position("center")
    zoom = 1.06
    c = clip.resized(height=int(H * zoom))
    extra = (H * zoom - H) / 2.0

    def pos(t, _d=duration, _extra=extra):
        return ("center", -_extra + _extra * (1 - t / _d))

    return c.with_position(pos)


def make_gradient_clip(index, duration):
    c1 = (random.randint(20, 90), random.randint(20, 90), random.randint(100, 200))
    c2 = (10, 10, 30)
    img = Image.new("RGB", (W, H), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        draw.line([(0, y), (W, y)],
                  fill=(int(c1[0] * (1 - t) + c2[0] * t),
                        int(c1[1] * (1 - t) + c2[1] * t),
                        int(c1[2] * (1 - t) + c2[2] * t)))
    p = os.path.join(CLIPS_DIR, f"bg_{index:03d}.png")
    img.save(p)
    clip = ImageClip(p).with_duration(duration)
    return _kenburns(clip, duration).with_duration(duration)


def fetch_pexels_clip(keyword, index, attempts=2):
    """Pexels API se free HD stock video download. No key/fail -> gradient fallback."""
    path = os.path.join(CLIPS_DIR, f"clip_{index:03d}.mp4")
    # Crash-resume: pehle se downloaded clip -> reuse (network + time bachta hai)
    if os.path.exists(path) and os.path.getsize(path) > 50_000:
        print(f"    clip {index + 1}: reuse (cached)", flush=True)
        return path
    key = CFG.get("pexels_api_key", "")
    if key and "YAHAN" not in key:
        for attempt in range(1, attempts + 1):
            try:
                r = requests.get(
                    "https://api.pexels.com/videos/search",
                    params={"query": keyword, "orientation": ORIENT, "per_page": 5},
                    headers={"Authorization": key},
                    timeout=30)
                r.raise_for_status()
                vids = r.json().get("videos", [])
                for v in vids:
                    if LANDSCAPE:
                        files = [f for f in v.get("video_files", [])
                                 if f.get("width", 0) >= 1280 and f.get("height", 0) >= 720]
                    else:
                        files = [f for f in v.get("video_files", [])
                                 if 1280 <= f.get("height", 0) <= 2160]
                    if not files:
                        files = v.get("video_files", [])
                    if files:
                        best = sorted(files, key=lambda f: f.get("height", 0))[-1]
                        d = requests.get(best["link"], timeout=120)
                        with open(path, "wb") as fh:
                            fh.write(d.content)
                        if os.path.getsize(path) > 50_000:
                            print(f"    clip {index + 1}: pexels ok ({best.get('height')}p)")
                            return path
                        print(f"    [!] clip {index + 1}: too small, retry")
            except Exception as e:
                print(f"    [!] pexels fail ({keyword}) attempt {attempt}: {e}")
            time.sleep(1.5 * attempt)
    print(f"    clip {index + 1}: gradient background use hua")
    return None


def fit_clip(clip, duration):
    """Clip ko W x H mein crop/resize, duration tak loop/trim, + ken burns."""
    c = clip
    if c.duration is None or c.duration < duration:
        c = c.loop(duration=duration)
    else:
        c = c.subclipped(0, duration)
    target_ratio = W / H
    if c.w / c.h > target_ratio:
        c = c.resized(height=H).cropped(x_center=c.w / 2, width=W)
    else:
        c = c.resized(width=W).cropped(y_center=c.h / 2, height=H)
    return _kenburns(c, duration).with_duration(duration)


# --------------------------------------------------------------- thumbnail
def wrap_by_pixels(draw, text, font, maxw):
    lines, cur, cur_w = [], [], 0
    space_w = font.getlength(" ")
    for w in text.split():
        ww = font.getlength(w)
        if cur and cur_w + space_w + ww > maxw:
            lines.append(" ".join(cur))
            cur, cur_w = [], 0
        cur.append(w)
        cur_w += ww + (space_w if cur else 0)
    if cur:
        lines.append(" ".join(cur))
    return lines


def _ffmpeg(args):
    """moviepy ke bundled ffmpeg binary se chalao (PATH par ffmpeg hona zaroori nahi)."""
    import subprocess
    exe = __import__("imageio_ffmpeg").get_ffmpeg_exe()
    r = subprocess.run([exe, "-hide_banner", "-loglevel", "error", *args],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg fail: " + (r.stderr or r.stdout or "")[-2000:])


def make_thumbnail(video_path, title, out_path="output/thumbnail.jpg"):
    """Final video ka frame + title text overlay = thumbnail (ffmpeg frame grab)."""
    frame_png = os.path.join(CLIPS_DIR, "thumb_frame.png")
    _ffmpeg(["-y", "-ss", "1.5", "-i", video_path, "-frames:v", "1", frame_png])
    img = Image.open(frame_png).convert("RGBA")
    W_, H_ = img.size
    overlay = Image.new("RGBA", (W_, H_), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    gh = int(H_ * 0.38)
    for i in range(gh):
        a = int(225 * i / gh)
        d.line([(0, H_ - gh + i), (W_, H_ - gh + i)], fill=(0, 0, 0, a))
    img = Image.alpha_composite(img, overlay)
    if title:
        try:
            d = ImageDraw.Draw(img)
            font = _font(int(W_ * 0.085))
            lines = wrap_by_pixels(d, title, font, W_ - 80)
            line_h = int(W_ * 0.105)
            y = H_ - gh + 30
            for ln in lines:
                tw = font.getlength(ln)
                x = (W_ - tw) / 2
                d.text((x, y), ln, font=font, fill="white",
                       stroke_width=int(W_ * 0.009), stroke_fill="black")
                y += line_h
        except Exception as e:
            print(f"    [!] thumbnail text skip: {e}")
    img.convert("RGB").save(out_path, quality=90)
    try:
        os.remove(frame_png)
    except Exception:
        pass
    return out_path


def make_video(script_data, audio_files, voiceover_path, out_path="output/final.mp4", clips_dir=None):
    """Memory-safe pipeline: HAR SEGMENT alag se render hota hai (1 clip at a time),
    phir ffmpeg -c copy se concat, phir audio mux. 120 segments par bhi no crash.
    Upgrade: clips_dir doge to usi dir ke pehle se maujood clips/segs reuse honge (crash-resume)."""
    global CLIPS_DIR
    if clips_dir and os.path.isdir(clips_dir):
        CLIPS_DIR = clips_dir  # purane run ka partial data reuse karo
    os.makedirs(CLIPS_DIR, exist_ok=True)
    os.makedirs("output", exist_ok=True)
    sentences = script_data["sentences"]
    keywords = script_data["visual_keywords"]
    total = len(sentences)

    print("[4/6] Clips download ho rahe hain...")
    clip_paths = []
    for i in range(total):
        clip_paths.append(fetch_pexels_clip(keywords[i], i))

    total_dur = sum(d + (PAUSE if i < total - 1 else 0.0) for i, (_, d) in enumerate(audio_files))

    print("[5/6] Segments render ho rahe hain (memory-safe, 1 segment at a time)...")
    seg_paths = []
    t = 0.0
    for i, (apath, dur) in enumerate(audio_files):
        seg = dur + (PAUSE if i < total - 1 else 0.0)
        if clip_paths[i] and os.path.exists(clip_paths[i]):
            try:
                bg = fit_clip(VideoFileClip(clip_paths[i]), seg)
            except Exception:
                bg = make_gradient_clip(i, seg)
        else:
            bg = make_gradient_clip(i, seg)
        layers = [bg]
        pngs = []
        if CAPTION_STYLE == "wordpop":
            words = sentences[i].split()
            nw = max(1, len(words))
            wdur = dur / nw
            for k in range(nw):
                start = t + k * wdur
                wlen = wdur + (0.05 if k < nw - 1 else 0.0)
                window = words[max(0, k - (WORDS_PER_GROUP - 1)): k + 1]
                img = render_wordpop(window, len(window) - 1)
                p = os.path.join(CLIPS_DIR, f"sub_{i:03d}_{k:02d}.png")
                img.save(p)
                pngs.append(p)
                layers.append(ImageClip(p).with_start(start - t + 0.02).with_duration(wlen)
                              .with_position(("center", H - img.height - SUB_MARGIN)))
                if SHOW_PROGRESS:
                    bar = ImageClip(progress_bar_png((start + wlen / 2) / total_dur)) \
                        .with_start(start - t).with_duration(wlen).with_position((0, 0))
                    layers.append(bar)
        else:
            img = render_subtitle(sentences[i])
            p = os.path.join(CLIPS_DIR, f"sub_{i:03d}.png")
            img.save(p)
            pngs.append(p)
            layers.append(ImageClip(p).with_start(0.05).with_duration(dur)
                          .with_position(("center", H - img.height - SUB_MARGIN)))
            if SHOW_PROGRESS:
                bar = ImageClip(progress_bar_png((t + seg / 2) / total_dur)) \
                    .with_start(0).with_duration(seg).with_position((0, 0))
                layers.append(bar)
        t += seg
        seg_path = os.path.join(CLIPS_DIR, f"seg_{i:03d}.mp4")
        # Crash-resume: ye segment render ho chuka tha -> skip (cleanup + reuse)
        if os.path.exists(seg_path) and os.path.getsize(seg_path) > 200_000:
            print(f"    seg {i + 1}/{total} reuse (cached)", flush=True)
            seg_paths.append(seg_path)
            try:
                bg.close()
            except Exception:
                pass
            for _p in pngs:
                try:
                    os.remove(_p)
                except Exception:
                    pass
            continue
        comp = CompositeVideoClip(layers, size=(W, H))
        comp.write_videofile(seg_path, fps=30, codec="libx264", preset="veryfast",
                             threads=min(4, os.cpu_count() or 2), audio=False,
                             logger=None, ffmpeg_params=["-crf", "19", "-pix_fmt", "yuv420p"])
        comp.close()
        try:
            bg.close()
        except Exception:
            pass
        for _p in pngs:
            try:
                os.remove(_p)
            except Exception:
                pass
        seg_paths.append(seg_path)
        print(f"    seg {i + 1}/{total} done ({seg:.1f}s)", flush=True)

    print("    Segments concat ho rahe hain (ffmpeg -c copy)...", flush=True)
    concat_path = os.path.join("audio", "concat_video.mp4")
    list_file = os.path.join(CLIPS_DIR, "concat_list.txt")
    with open(list_file, "w", encoding="utf-8") as fh:
        for pth in seg_paths:
            fh.write("file '" + pth.replace("\\", "/").replace("'", "'\\''") + "'\n")
    _ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", concat_path])

    print("    Audio mix (voiceover + music)...", flush=True)
    voice = AudioFileClip(voiceover_path)
    use_voice = voice
    if FADE:
        try:
            use_voice = voice.with_effects([AudioFadeIn(0.1), AudioFadeOut(0.3)])
        except Exception:
            use_voice = voice
    audio_parts = [use_voice]
    music_file = CFG.get("background_music")
    vol = CFG.get("music_volume", 0.12)
    if music_file and os.path.exists(music_file):
        try:
            music = AudioFileClip(music_file)
            if music.duration < total_dur:
                music = music.loop(duration=total_dur)
            music = music.subclipped(0, total_dur).with_volume_scaled(vol)
            if FADE:
                music = music.with_effects([AudioFadeOut(2.0)])
            audio_parts.append(music)
        except Exception as e:
            print(f"    [!] music skip: {e}")
    mix_path = os.path.join("audio", "mix_full.mp3")
    if len(audio_parts) == 1:
        final_audio = use_voice
    else:
        final_audio = CompositeAudioClip(audio_parts).with_duration(total_dur)
    final_audio.write_audiofile(mix_path, fps=44100, logger=None)
    try:
        voice.close()
    except Exception:
        pass

    print("[6/6] Final mux (video + audio)...", flush=True)
    _ffmpeg(["-y", "-i", concat_path, "-i", mix_path, "-c:v", "copy", "-c:a", "aac",
             "-b:a", "192k", "-shortest", "-movflags", "+faststart", out_path])
    for pth in seg_paths:
        try:
            os.remove(pth)
        except Exception:
            pass
    try:
        os.remove(concat_path)
    except Exception:
        pass
    try:
        thumb = make_thumbnail(out_path, script_data.get("title", ""))
        print(f"    Thumbnail: {thumb}")
    except Exception as e:
        print(f"    [!] thumbnail skip: {e}")
    return out_path


if __name__ == "__main__":
    print("Ye module main.py se chalaya jata hai. Wahan se run karo!")

