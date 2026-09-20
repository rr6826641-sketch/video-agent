# UNIFIED VIDEO AGENT  (script -> video -> real YouTube upload)

Ye teen hisson ko jor kar ek agent bana dia gaya hai:

| Hissa | Kya karta hai |
|-------|----------------|
| `video-agent/` (Python) | ASLI pipeline: Gemini script -> Edge-TTS voice -> Pexels clips -> ffmpeg edit -> **real OAuth upload** (`uploader.py`) |
| `unified-agent/` (Web)  | Agent A ka on-device renderer + Review Desk (script -> render -> review -> approve) |
| `video-agent/bridge_server.py` | Dono ke darmiyan **real wire**: web UI ka master + upload card le kar asli `uploader.py` se YouTube par daalta hai |

Agent B (NORTHPINE) sirf UX prototype tha (sab simulate). Agent A ka upload FAKE tha
(sirf mock video id). Ab upload ASLI hai — bridge ke through (verify ho chuka hai).

## Chalane ka tareeqa (ek click)

1. `video-agent\start_unified.bat`  (ya `python start_unified.py`)
2. Browser khud khulega: http://127.0.0.1:5055
3. UI mein script -> render -> Review Desk -> **Approve & upload to YouTube**
   - Bridge online chip GREEN hoga to upload REAL hoga
   - Bridge offline ho to UI saaf "SIMULATED" likhta hai (dhoka nahi deta)

## OAuth credentials — ab SIRF EK command

System par pehle se ek **valid** Google OAuth client + token mojood hai
(`video-agent/client_secrets.json` + `video-agent/token.json`). Isi liye naya
Google Cloud project banane ki zaroorat NAHI hai.

**Step 1 — credentials ko channel par wire karo (ek dafa):**

```
cd video-agent
python link_youtube.py --channel bushcraft   --import-root
python link_youtube.py --channel dark_history --import-root
```

Ye root `client_secrets.json` + `token.json` ko `channels/<channel>/` mein copy kar
deta hai. Uske baad upload turant kaam karta hai.

> NOTE: `--import-root` wahi Google account use karta hai jo root token ka owner hai.
> Do alag channels ko do alag accounts par bhejna ho to har channel ka apna login
> karo (neeche Step 3).

**Step 2 — (optional) thumbnails ke liye scope upgrade:**

Root token mein sirf `youtube.upload` scope hai, is liye thumbnail upload SKIP hota
hai (video phir bhi chali jati hai — graceful degrade, koi crash nahi). Thumbnail
chahiye to ek dafa ye chalao aur browser ka `code=` wala URL paste karo:

```
python link_youtube.py --channel bushcraft
```

**Step 3 — (agar alag account chahiye) naya OAuth client:**

1. Google Cloud Console -> naya project -> **YouTube Data API v3** enable
2. Credentials -> Create Credentials -> OAuth client ID -> **Desktop app** -> JSON download
3. Us JSON ko `channels/<channel>/client_secrets.json` naam se rakho
4. `python link_youtube.py --channel <channel>`

## Full Python pipeline alag se

```
python main.py --channel dark_history            # 1 poora video + (auto) upload
python main.py --no-upload --channel bushcraft   # sirf banao, review ke liye
python uploader.py --channel bushcraft           # approve ke baad real upload
```

## Safety guard

Cross-upload code-level block hai: bushcraft video kabhi dark_history ke
account par nahi ja sakti. Har channel ke token alag hote hain.

## Verified status (is build mein)

- Bridge `/api/health` OK -> channels: [bushcraft, dark_history]
- UI same-origin serve hota hai (GET / -> Wildline Studio)
- **REAL upload verify hua (20 Sep 2026):** bridge -> `uploader.py` -> YouTube
  - video: `https://youtube.com/watch?v=FTfuZJqHmy0` (unlisted, bushcraft)
  - thumbnail skip hui (scope), video phir bhi upload hui — expected behaviour
- `uploader.py` graceful degrade patch: optional scope missing par login force
  nahi karta, thumbnail skip kar deta hai.

## Backups

Patch se pehle original files ka backup: `video-agent/_backup_unified/`
(uploader.py.bak, link_youtube.py.bak, channels.json.bak). Restore ke liye copy back.

---

## Update — 20 Sep 2026 (dark_history wired into the web agent)

**Kya add hua:**

1. `unified-agent` ab isi repo ke andar hai -> `video-agent/unified-agent/`
   (pehle bahar tha). Purana rasta `..\unified-agent` ek Windows **junction** se
   ab bhi kaam karta hai, is liye purane shortcut/script nahi tootenge.
2. Web UI mein chautha channel **Dark History** (`id: dark_history`) add ho gaya
   (`unified-agent/src/lib/script.ts`). Yani ab UI se:
   script -> render -> Review Desk -> **real upload** dark_history par bhi ho sakta hai.
3. `bridge_server.py` ab build ko do jagah dhoondta hai:
   `./unified-agent/dist` (repo ke andar) aur `../unified-agent/dist` (sibling).

**Zaroori baat (channel vs Google account):**

`dark_history` ke credentials `--import-root` se aaye hain, is liye wo **wahi
Google account** use karte hain jo bushcraft ka hai. Yani dono channel abhi ek hi
YouTube channel par upload karenge. Do alag YouTube channels chahiye to:

```
python link_youtube.py --channel dark_history      # us account se login (naya browser code)
```

**Verified is update mein:**

- Bushcraft aur dark_history dono ke token refresh OK (`youtube.upload` scope mojood)
- `npm run build` pass (dark_history preset ke saath, 53 modules)
- Junction ke through purana path `..\unified-agent\dist\index.html` khulta hai
