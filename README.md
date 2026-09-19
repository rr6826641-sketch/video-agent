# 🎬 VIDEO AGENT — Auto YouTube Shorts Machine

Ek hi command: script likhega, voiceover banayega, HD clips download karega, CapCut-jaisi edit karega (subtitles + music + crop), aur khud YouTube par upload kar dega. Sab FREE tools.

## Kaam kaise karta hai
```
Gemini (script) -> Edge-TTS (voice) -> Pexels (HD clips) -> MoviePy (edit) -> YouTube (upload)
```

## SETUP (ek baar, 20 minute)

### Step 1: Install
```
cd video-agent
pip install -r requirements.txt
```

### Step 2: Keys daalo (config.json)
1. `gemini_api_key` — https://aistudio.google.com/apikey se FREE Gemini key lo
2. `pexels_api_key` — https://www.pexels.com/api/ pe jao, FREE key lo (1 click)

### Step 3: YouTube upload setup (ek baar)
1. https://console.cloud.google.com pe jao, naya project banao
2. "APIs & Services > Library" mein jao -> "YouTube Data API v3" search karo -> ENABLE dabao
3. "APIs & Services > OAuth consent screen" -> External -> app ka naam do -> Email add -> Save (scopes skip karo, test users apni email add karo)
4. "Credentials > Create Credentials > OAuth client ID" -> Application type: "Desktop app" -> Create
5. JSON download karo -> file ka naam `client_secrets.json` karo -> video-agent folder mein rakho
6. Pehli upload par browser khulega, Google account se login karo -> allow. Uske baad auto (token.json ban jayega).

NOTE: Naye Google projects ke YouTube API uploads pehle "private" hote hain audit tak. Kuch din test karo, phir Google se verify karwao (verify na ho to bhi tum apne channel pe upload kar sakte ho, bas public visibility ke liye audit chahiye ho sakta hai). Isliye pehle `config.json` mein `"privacy": "unlisted"` rakhna behtar hai jab tak audit na ho.

### Step 4: Music (optional)
Koi bhi copyright-free music mp3 lo (YouTube Audio Library free hai) -> `music.mp3` naam se folder mein rakho. Na ho to bhi chalega (sirf voiceover hoga).

## RUN
```
python main.py                # 1 video banao + upload
python main.py --no-upload    # sirf practice/test, upload nahi
python main.py --count 3      # 3 videos ek saath
python uploader.py            # agar upload fail ho, baad se sirf upload
```
Output: `output/final.mp4` + `output/thumbnail.jpg`

## DAILY AUTOMATIC (Windows Task Scheduler)
1. Start menu -> "Task Scheduler" kholo
2. Create Basic Task -> Naam: VideoAgent -> Daily -> Time: subah 10:00
3. Action: Start a program
   Program: `python`
   Arguments: `main.py`
   Start in: `C:\path\to\video-agent` (apna folder path)
4. Finish. Roz khud video banega aur upload hoga!

## Settings badalna (config.json)
- `niche` — content ka topic ("amazing facts", "tech news", "islamic stories"...)
- `language` — "English" ya "Urdu"
- `voice` — English: en-US-GuyNeural, en-US-AriaNeural | Urdu: ur-PK-UzmaNeural (config ki `urdu_voice` field)
- `sentences_per_video` — 6-10 best (30-50 sec Shorts)
- `resolution` — Shorts ke liye [1080, 1920] rehne do
- `music_volume` — 0.10-0.20 best

## Common Problems
- Gemini fail -> key galat hai ya net slow. Fallback script chalega.
- Upload "quotaExceeded" -> din mein zyada uploads kiye. Kal try karo (free quota: 6/din approx).
- Pexels clips nahi aye -> key check karo. Gradient background se video banti rahegi.
- MoviePy error -> `pip install --upgrade moviepy imageio-ffmpeg`

---

## 🖥️ Web UI (complete)

`python app_ui.py` → browser: **http://127.0.0.1:5001** (`ui/templates/index.html`)

- **Generate:** topic do → video banegi (upload NAHI) — live log
- **Confirm & Upload:** video pehle preview karo (`/video` + `/thumb`), theek lage to button dabao → YouTube (pehli baar Google login)
- **Quota guard:** free API ~6 uploads/day — UI khud rokti hai
- Job cancel, privacy select (public/unlisted/private)

## ⏭️ Interrupted render resume (10-min history video)

`python resume_run.py` — bina Gemini/TTS, bina naye clips:

- Sabse naya `audio/voiceover_v*.mp3` reuse (120 sentences, ~10 min)
- Crash-resume: pehle se downloaded clips/segments reuse (`clips/run_*`)
- MoviePy MemoryError par khud 2 attempts (08:08 fail → 08:48 success wali known issue)
- Upload NAHI karta — confirmation ke baad UI se upload karo

## ⚠️ Ops Notes (19 Sep 2026)

| Cheez | Status |
|---|---|
| Thumbnail upload | `upload_thumbnail: true` config mein hai, par token.json mein sirf `youtube.upload` scope hai → thumbnail ke liye **naya login** chahiye (force-ssl scope). `uploader.py` khud browser login kholta hai |
| Quota | ~6 uploads/day free API — `python uploader.py` zyada baar mat chalao (quotaExceeded) |
| Moviepy render | Kabhi kabhi MemoryError — main.py khud 2 attempts karta hai |
| Resume | `resume_run.py` v3 — voiceover + clips/segments reuse, render retry, upload pending |
| Resolution | Config `[1920, 1080]` = Full HD (YouTube max standard kaam par). "16K" ka koi standard nahi — 4K ke liye `[3840, 2160]` lagao (render 4-5x slow) |

## 🔐 GitHub par upload se pehle

`config.json`, `client_secrets.json`, `token*.json` → **.gitignore** mein hain (API keys/refresh tokens kabhi public mat karo).
`config.example.json` template ke tor par commit karo.

### Install
```bash
pip install -r requirements.txt
python app_ui.py
```
