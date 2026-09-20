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
try:
    from moviepy.video.fx import Colorx as _Colorx
except Exception:
    _Colorx = None
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

# ---- CapCut Pro-style cinematic engine (config.json: "cinematic": {...}) ----
CINE = CFG.get("cinematic", {})
CAPTION_BOX = bool(CINE.get("caption_box", True))          # text ke peeche rounded box
LETTERBOX = bool(CINE.get("letterbox", True))              # cinematic 2.35:1 black bars
BAR_PCT = max(0.0, min(0.15, float(CINE.get("letterbox_height_pct", 8)) / 100.0))
BAR_H = int(H * BAR_PCT)                                    # ek bar ki height (px)
COLOR_GRADE = float(CINE.get("color_grade", 1.12))         # per-clip saturation boost
SCENE_STYLES = bool(CINE.get("scene_styles", True))        # 4 rotating Ken Burns styles
INTRO_CARD = bool(CINE.get("intro_card", True))
INTRO_DUR = float(CINE.get("intro_duration", 2.5))
OUTRO_CARD = bool(CINE.get("outro_card", True))
OUTRO_DUR = float(CINE.get("outro_duration", 3.0))
CARDS_SEP = " — "

# ---- Render speed (config.json: "render": {...}) ----
# Asli bottleneck: 4K Pexels clips ko moviepy per-frame 1080p mein resize karta tha.
# Ab (1) download par target-resolution ke qareeb clip chunte hain,
#    (2) clip ko ek baar ffmpeg se normalize karte hain (4K->1080p),
#    (3) encoder preset/crf/threads config se control hote hain.
_R = CFG.get("render", {})
RENDER_PRESET = str(_R.get("preset", "superfast"))
RENDER_CRF = str(_R.get("crf", 21))
RENDER_THREADS = int(_R.get("threads", 0)) or (os.cpu_count() or 2)
NORMALIZE_CLIPS = bool(_R.get("normalize_clips", True))
CLIP_TARGET_H = int(_R.get("clip_target_height", H))
RENDER_FPS = int(CFG.get("fps", 30))
ENC_ARGS = ["-crf", RENDER_CRF, "-pix_fmt", "yuv420p"]
_CH = json.load(open("channels.json", encoding="utf-8")) if os.path.exists("channels.json") else {}


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
def wrap_by_pixels(draw, text, font, maxw):
    """Text ko pixels ke hisaab se wrap karo (font-size independent)."""
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render_subtitle(text, font_size=FONT_SIZE):
    """Static caption: poora sentence, white text + black outline.
    CapCut Pro style: CAPTION_BOX on = rounded semi-transparent box behind text."""
    font = _font(font_size)
    maxw = W - 120
    img = Image.new("RGBA", (W - 40, 500), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    lines = wrap_by_pixels(draw, text, font, maxw)
    line_h = int(font_size * 1.32)
    # measure block width
    widths = [draw.textlength(ln, font=font) for ln in lines]
    block_w = int(max(widths)) + 56
    block_h = len(lines) * line_h + 40
    bx0 = (img.width - block_w) // 2
    by0 = 10
    if CAPTION_BOX:
        draw.rounded_rectangle([bx0, by0, bx0 + block_w, by0 + block_h],
                               radius=22, fill=(8, 8, 12, 145),
                               outline=(255, 255, 255, 26), width=2)
    y = by0 + 20
    for i, ln in enumerate(lines):
        x = (img.width - widths[i]) // 2
        draw.text((x, y), ln, font=font, fill="white",
                  stroke_width=6, stroke_fill="black")
        y += line_h
    return img.crop((0, 0, img.width, min(by0 + block_h + 10, 500)))


def render_wordpop(words, active_idx, font_size=FONT_SIZE):
    """Word-by-word karaoke caption (CapCut Pro style):
    past words grey, active word yellow + underline bar, upcoming white, rounded box."""
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

    if CAPTION_BOX:
        draw.rounded_rectangle([2, 2, maxw + 18, height - 2], radius=20,
                               fill=(8, 8, 12, 145), outline=(255, 255, 255, 26), width=2)
    # past = grey, active = yellow + underline bar, upcoming = white (CapCut karaoke)
    idx = 0
    for li, line_words in enumerate(lines):
        x = line_layout(line_words)
        y = 12 + li * line_h
        for w in line_words:
            fill = "white"
            if idx < active_idx:
                fill = "#A8ADB8"
            elif idx == active_idx:
                fill = ACTIVE_COLOR
            if fill != ACTIVE_COLOR:
                draw.text((x, y), w, font=font, fill=fill,
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
                ww = font.getlength(w)
                bar_y = y + int(font_size * 1.18)
                draw.rounded_rectangle([x - 2, bar_y, x + ww + 2, bar_y + 7], radius=3,
                                       fill=ACTIVE_COLOR)
                break
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
def _kenburns(clip, duration, seed=0):
    """CapCut-style dynamic camera: 4 styles rotate (zoom-in / zoom-out / pan-LR / pan-RL).
    Har scene ko apna motion milta hai — flat slideshow feel khatam."""
    if not (KEN_BURNS and duration >= 1.5):
        return clip.with_position("center")
    mode = (seed if SCENE_STYLES else 0) % 4
    zoom = 1.10
    c = clip.resized(height=int(H * zoom))
    ex = (H * zoom - H) / 2.0

    if mode == 0:      # zoom-in feel: upar se neeche settle
        def pos(t, _d=duration, _ex=ex):
            return ("center", -_ex + _ex * (t / _d))
    elif mode == 1:    # zoom-out feel: neeche se upar reveal
        def pos(t, _d=duration, _ex=ex):
            return ("center", _ex - _ex * (t / _d))
    elif mode == 2:    # pan left -> right
        # NOTE: moviepy 2.x Crop me x_center ke saath width/height dena ZAROORI hai,
        # warna 'NoneType / int' crash. Isliye width=W, height=H explicit.
        w2 = int(W * (zoom + 0.04))
        c2 = clip.resized(width=w2)
        c2 = c2.cropped(x_center=w2 / 2.0, y_center=c2.h / 2.0, width=W, height=H)
        ex2 = (w2 - W) / 2.0
        def pos2(t, _d=duration, _ex=ex2):
            return (-_ex + 2 * _ex * (t / _d), "center")
        return c2.with_position(pos2)
    else:              # pan right -> left
        w2 = int(W * (zoom + 0.04))
        c2 = clip.resized(width=w2)
        c2 = c2.cropped(x_center=w2 / 2.0, y_center=c2.h / 2.0, width=W, height=H)
        ex2 = (w2 - W) / 2.0
        def pos3(t, _d=duration, _ex=ex2):
            return (_ex - 2 * _ex * (t / _d), "center")
        return c2.with_position(pos3)

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
    return _kenburns(clip, duration, index).with_duration(duration)


def _normalize_clip(src, index):
    """Clip ko ek baar ffmpeg se exact W x H (target resolution) mein scale karo.
    Isse moviepy 4K source ko per-frame resize nahi karta — render bahut tez.
    Fail ho to original path wapas."""
    if not NORMALIZE_CLIPS:
        return src
    norm = os.path.join(CLIPS_DIR, f"clip_{index:03d}_n.mp4")
    if os.path.exists(norm) and os.path.getsize(norm) > 50_000:
        return norm
    try:
        _ffmpeg(["-y", "-i", src,
                 "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,"
                        f"crop={W}:{H},fps={RENDER_FPS}",
                 "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                 "-pix_fmt", "yuv420p", norm])
        if os.path.exists(norm) and os.path.getsize(norm) > 50_000:
            print(f"    clip {index + 1}: normalized -> {W}x{H}", flush=True)
            return norm
    except Exception as e:
        print(f"    [!] clip {index + 1}: normalize skip ({e})", flush=True)
    return src


def _pick_best_file(video_files, target_h):
    """Target resolution ke SABSE QAREEB file chuno (4K download mat karo).
    Pehle target se bade/barabar sabse chhoti file; warna sabse badi available."""
    if not video_files:
        return None
    ge = [f for f in video_files if f.get("height", 0) >= target_h]
    if ge:
        return min(ge, key=lambda f: f.get("height", 0))
    return max(video_files, key=lambda f: f.get("height", 0))


def fetch_pexels_clip(keyword, index, attempts=2):
    """Pexels API se stock video download + target-res normalize. Fail -> gradient fallback.
    Speed: 4K nahi — target height (CLIP_TARGET_H) ke qareeb clip chunte hain."""
    path = os.path.join(CLIPS_DIR, f"clip_{index:03d}.mp4")
    norm = os.path.join(CLIPS_DIR, f"clip_{index:03d}_n.mp4")
    # Crash-resume: normalized ya raw clip pehle se hai -> reuse
    if os.path.exists(norm) and os.path.getsize(norm) > 50_000:
        print(f"    clip {index + 1}: reuse (normalized)", flush=True)
        return norm
    if os.path.exists(path) and os.path.getsize(path) > 50_000:
        print(f"    clip {index + 1}: reuse (cached)", flush=True)
        return _normalize_clip(path, index)
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
                target_h = CLIP_TARGET_H if LANDSCAPE else max(CLIP_TARGET_H, 1920)
                for v in vids:
                    files = v.get("video_files", [])
                    if LANDSCAPE:
                        files = [f for f in files if f.get("height", 0) >= 720]
                    else:
                        files = [f for f in files if 1280 <= f.get("height", 0) <= 2160]
                    if not files:
                        files = v.get("video_files", [])
                    best = _pick_best_file(files, target_h)
                    if best:
                        d = requests.get(best["link"], timeout=120)
                        with open(path, "wb") as fh:
                            fh.write(d.content)
                        if os.path.getsize(path) > 50_000:
                            print(f"    clip {index + 1}: pexels ok ({best.get('height')}p)")
                            return _normalize_clip(path, index)
                        print(f"    [!] clip {index + 1}: too small, retry")
            except Exception as e:
                print(f"    [!] pexels fail ({keyword}) attempt {attempt}: {e}")
            time.sleep(1.5 * attempt)
    print(f"    clip {index + 1}: gradient background use hua")
    return None


def fit_clip(clip, duration, seed=0):
    """Clip ko W x H mein crop/resize, duration tak loop/trim, +
    dynamic ken burns + color grade (CapCut-style punch)."""
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
    if _Colorx is not None and COLOR_GRADE != 1.0:
        try:
            c = c.with_effects([_Colorx(COLOR_GRADE)])
        except Exception:
            pass
    return _kenburns(c, duration, seed).with_duration(duration)


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


# ---------------------------------------------------------------- cards
_bar_png_cache = {}


def _bar_png(name):
    """Letterbox black bar PNG (cached)."""
    if name in _bar_png_cache:
        return _bar_png_cache[name]
    if name == "bar_top":
        img = Image.new("RGB", (W, BAR_H), (0, 0, 0))
    else:
        img = Image.new("RGB", (W, BAR_H), (0, 0, 0))
    p = os.path.join(CLIPS_DIR, name + ".png")
    img.save(p)
    _bar_png_cache[name] = p
    return p


def letterbox_layers(dur):
    """Cinematic top+bottom black bars (CapCut 2.35:1 vibe)."""
    if not (LETTERBOX and BAR_H > 0):
        return []
    top = ImageClip(_bar_png("bar_top")).with_duration(dur).with_position((0, 0))
    bot = ImageClip(_bar_png("bar_bot")).with_duration(dur).with_position((0, H - BAR_H))
    return [top, bot]


def make_card_png(kind, title, sub=""):
    """Intro/outro full-screen card (CapCut template-style): dark gradient +
    accent bar + bada bold title + channel line. Return PNG path."""
    img = Image.new("RGB", (W, H), (8, 10, 16))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        c = (int(10 + 22 * (1 - t)), int(12 + 18 * (1 - t)), int(26 + 52 * (1 - t)))
        d.line([(0, y), (W, y)], fill=c)
    m = int(W * 0.10)
    d.rounded_rectangle([m, int(H * 0.30), W - m, H - int(H * 0.30)],
                        radius=28, outline=(255, 255, 255, 60), width=3)
    if kind == "intro":
        head = sub or "WILD STORIES"
        big = title or "Cinematic Story"
    else:
        head = "THANK YOU FOR WATCHING"
        big = (sub or "SUBSCRIBE").upper() if not sub else sub.upper()
    hf = _font(int(H * 0.055))
    d.text((W / 2, int(H * 0.375)), head, font=hf, fill=ACTIVE_COLOR,
           anchor="mm", stroke_width=2, stroke_fill="black")
    bf = _font(int(H * 0.075))
    lines = wrap_by_pixels(d, big, bf, W - int(W * 0.1))
    y = int(H * 0.47)
    lh = int(H * 0.10)
    for ln in lines:
        d.text((W / 2, y), ln, font=bf, fill="white", anchor="mm",
               stroke_width=4, stroke_fill="black")
        y += lh
    if kind == "outro":
        sf = _font(int(H * 0.038))
        d.text((W / 2, H - int(H * 0.19)), "Agar video pasand aaye to LIKE + SUBSCRIBE karein",
               font=sf, fill="#E8E8E8", anchor="mm", stroke_width=1, stroke_fill="black")
    p = os.path.join(CLIPS_DIR, f"card_{kind}_{time.strftime('%H%M%S')}.png")
    img.save(p)
    return p


def make_card_seg(idx, kind, title, sub="", dur=2.5):
    """Card PNG ko ek silent seg.mp4 mein render karo (body segs jaisi hi coding)."""
    png = make_card_png(kind, title, sub)
    seg_path = os.path.join(CLIPS_DIR, f"card_seg_{idx:02d}.mp4")
    clip = ImageClip(png).with_duration(dur)
    clip.write_videofile(seg_path, fps=RENDER_FPS, codec="libx264", preset=RENDER_PRESET,
                         threads=RENDER_THREADS, audio=False,
                         logger=None, ffmpeg_params=ENC_ARGS)
    clip.close()
    try:
        os.remove(png)
    except Exception:
        pass
    return seg_path


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


def make_video(script_data, audio_files, voiceover_path, out_path="output/final.mp4", clips_dir=None, channel=None):
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
    sub_margin = max(SUB_MARGIN, BAR_H + 40)   # captions letterbox bar ke upar rahein
    for i, (apath, dur) in enumerate(audio_files):
        seg = dur + (PAUSE if i < total - 1 else 0.0)
        if clip_paths[i] and os.path.exists(clip_paths[i]):
            try:
                bg = fit_clip(VideoFileClip(clip_paths[i]), seg, i)
            except Exception:
                bg = make_gradient_clip(i, seg)
        else:
            bg = make_gradient_clip(i, seg)
        layers = [bg] + letterbox_layers(seg)
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
                              .with_position(("center", H - img.height - sub_margin)))
                if SHOW_PROGRESS:
                    bar = ImageClip(progress_bar_png((start + wlen / 2) / total_dur)) \
                        .with_start(start - t).with_duration(wlen).with_position((0, BAR_H + 4))
                    layers.append(bar)
        else:
            img = render_subtitle(sentences[i])
            p = os.path.join(CLIPS_DIR, f"sub_{i:03d}.png")
            img.save(p)
            pngs.append(p)
            layers.append(ImageClip(p).with_start(0.05).with_duration(dur)
                          .with_position(("center", H - img.height - sub_margin)))
            if SHOW_PROGRESS:
                bar = ImageClip(progress_bar_png((t + seg / 2) / total_dur)) \
                    .with_start(0).with_duration(seg).with_position((0, BAR_H + 4))
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
        comp.write_videofile(seg_path, fps=RENDER_FPS, codec="libx264", preset=RENDER_PRESET,
                             threads=RENDER_THREADS, audio=False,
                             logger=None, ffmpeg_params=ENC_ARGS)
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

    # CapCut-style intro + outro cards (body ke aage/peeche)
    pad_in = INTRO_DUR if INTRO_CARD else 0.0
    pad_out = OUTRO_DUR if OUTRO_CARD else 0.0
    vtitle = script_data.get("title", "")
    vsub = ""
    if _CH.get("channels") and channel:
        vsub = _CH["channels"].get(channel, {}).get("name") or ""
    if INTRO_CARD:
        print("    Intro card render...", flush=True)
        seg_paths.insert(0, make_card_seg(-1, "intro", vtitle, vsub, INTRO_DUR))
    if OUTRO_CARD:
        print("    Outro card render...", flush=True)
        seg_paths.append(make_card_seg(999, "outro", "", vsub or "SUBSCRIBE", OUTRO_DUR))

    print("    Segments concat ho rahe hain (ffmpeg -c copy)...", flush=True)
    concat_path = os.path.join("audio", "concat_video.mp4")
    list_file = os.path.join(CLIPS_DIR, "concat_list.txt")
    with open(list_file, "w", encoding="utf-8") as fh:
        for pth in seg_paths:
            fh.write("file '" + pth.replace("\\", "/").replace("'", "'\\''") + "'\n")
    _ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", concat_path])

    print("    Audio mix (voiceover + music, intro sync)...", flush=True)
    video_dur = pad_in + total_dur + pad_out
    voice = AudioFileClip(voiceover_path)
    use_voice = voice
    if FADE:
        try:
            use_voice = voice.with_effects([AudioFadeIn(0.1), AudioFadeOut(0.3)])
        except Exception:
            use_voice = voice
    if pad_in > 0:
        use_voice = use_voice.with_start(pad_in)   # voiceover intro card ke baad shuru
    audio_parts = [use_voice]
    music_file = CFG.get("background_music")
    vol = CFG.get("music_volume", 0.12)
    if music_file and os.path.exists(music_file):
        try:
            music = AudioFileClip(music_file)
            if music.duration < video_dur:
                music = music.loop(duration=video_dur)
            music = music.subclipped(0, video_dur).with_volume_scaled(vol)
            if FADE:
                music = music.with_effects([AudioFadeOut(2.0)])
            audio_parts.append(music)
        except Exception as e:
            print(f"    [!] music skip: {e}")
    mix_path = os.path.join("audio", "mix_full.mp3")
    if len(audio_parts) == 1:
        final_audio = use_voice
        if pad_in > 0:
            final_audio = CompositeAudioClip([use_voice]).with_duration(video_dur)
    else:
        final_audio = CompositeAudioClip(audio_parts).with_duration(video_dur)
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
        thumb_name = f"thumbnail_{channel}.jpg" if channel else "thumbnail.jpg"
        thumb = make_thumbnail(out_path, script_data.get("title", ""), out_path=f"output/{thumb_name}")
        print(f"    Thumbnail: {thumb}")
    except Exception as e:
        print(f"    [!] thumbnail skip: {e}")
    return out_path


if __name__ == "__main__":
    print("Ye module main.py se chalaya jata hai. Wahan se run karo!")

