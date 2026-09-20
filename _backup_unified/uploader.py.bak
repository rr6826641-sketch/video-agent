"""uploader.py — YouTube Data API v3 se khud upload (pehli baar login, baad mein auto).
Upgrade v3 (2-CHANNEL SAFE):
  * channels.json se per-channel credentials (client_secrets + token + youtube settings)
  * HARD GUARD: video jis channel ke liye bani hai (last_video_info.json -> "channel"),
    upload SIRF usi channel ke credentials se hota hai.
    Cross-upload (bushcraft video -> dark history channel) code-level NAAMUMKIN hai:
      1) har channel ka apna OAuth client + token file hota hai (alag Google account)
      2) agar video ka channel != upload channel -> upload turant BLOCK
  * per-channel thumbnail: output/thumbnail_<channel>.jpg (agar hai), warna default thumbnail.jpg
"""
import json, os, socket, sys, time
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

CFG = json.load(open("config.json", encoding="utf-8"))
CHANNELS_CFG = json.load(open("channels.json", encoding="utf-8"))


def resolve_channel(name):
    """Channel ka naam -> channel object. Na ho to FORCE fail (koi fallback nahi)."""
    channels = CHANNELS_CFG.get("channels", {})
    if not name:
        name = CHANNELS_CFG.get("default_channel", "default")
    name = str(name).strip()
    if name not in channels:
        raise Exception(f"[!] Channel '{name}' channels.json mein nahi hai. Available: {list(channels)}")
    return name, channels[name]


def channel_youtube_cfg(channel_obj):
    """config.json ke youtube defaults + channel ke youtube overrides."""
    yt = dict(CFG.get("youtube", {}))
    yt.update(channel_obj.get("youtube", {}))
    return yt


def get_credentials(client_secrets, token_file, scopes):
    creds = None
    if os.path.exists(token_file):
        # NOTE: scopes param NAHI pass karte — warna original scopes overwrite ho jate hain
        creds = Credentials.from_authorized_user_file(token_file)
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception as e:
            print(f"    [!] Token refresh fail: {e}")
            creds = None
    if creds and creds.valid:
        have = set(creds.scopes or [])
        if set(scopes) <= have:
            return creds
        print("    [!] Token scopes purane hain — naya login chahiye")
        creds = None
    if not os.path.exists(client_secrets):
        raise Exception(f"{client_secrets} nahi mila! us channel ka OAuth client chahiye (README Step 3).")
    flow = InstalledAppFlow.from_client_secrets_file(client_secrets, scopes)
    creds = flow.run_local_server(port=0)  # browser khulega, ek baar login karna hai
    os.makedirs(os.path.dirname(os.path.abspath(token_file)), exist_ok=True)
    with open(token_file, "w") as f:
        f.write(creds.to_json())
    return creds


def thumbnail_for(channel):
    """Per-channel thumbnail priority: output/thumbnail_<channel>.jpg -> output/thumbnail.jpg."""
    cand = os.path.join("output", f"thumbnail_{channel}.jpg")
    if os.path.exists(cand):
        return cand
    return os.path.join("output", "thumbnail.jpg")


def load_last_video():
    if os.path.exists("last_video_info.json"):
        try:
            return json.load(open("last_video_info.json", encoding="utf-8"))
        except Exception:
            pass
    return {}


def upload(video_path, script_data, channel=None):
    # ---------------- channel resolution + HARD GUARD (no cross-upload) ----------------
    info_channel = script_data.get("channel")           # video kis channel ki hai
    use_channel = channel or info_channel or "default"
    if info_channel and info_channel != use_channel:
        raise Exception(
            f"[!] CROSS-UPLOAD BLOCKED: video '{info_channel}' channel ke liye bani hai, "
            f"lekin upload '{use_channel}' ke naam par ja raha tha. Rok diya."
        )
    cname, ch = resolve_channel(use_channel)
    yt_cfg = channel_youtube_cfg(ch)

    client_secrets = yt_cfg.get("client_secrets", "client_secrets.json")
    token_file = yt_cfg.get("token", "token.json")

    use_thumb = bool(yt_cfg.get("upload_thumbnail", False))
    scopes = ["https://www.googleapis.com/auth/youtube.upload"]
    if use_thumb:
        scopes.append("https://www.googleapis.com/auth/youtube.force-ssl")

    print(f"    Channel: {ch.get('name', cname)} ({cname})", flush=True)
    print(f"    Credentials: {client_secrets} + {token_file}", flush=True)

    creds = get_credentials(client_secrets, token_file, scopes)
    yt = build("youtube", "v3", credentials=creds)

    tags = list(script_data.get("tags", [])) + list(yt_cfg.get("tags_extra", []))
    title = script_data["title"][:100]
    if yt_cfg.get("title_prefix"):
        title = (str(yt_cfg["title_prefix"]) + title)[:100]
    body = {
        "snippet": {
            "title": title,
            "description": script_data["description"][:4900],
            "tags": tags[:30],
            "categoryId": yt_cfg.get("category_id", "28"),
        },
        "status": {
            "privacyStatus": yt_cfg.get("privacy", "unlisted"),
            "selfDeclaredMadeForKids": bool(yt_cfg.get("made_for_kids", False)),
        },
    }

    media = MediaFileUpload(video_path, chunksize=8 * 1024 * 1024, resumable=True,
                            mimetype="video/mp4")

    print("    YouTube par upload ho raha hai...", flush=True)
    response = None
    request = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    hard_fail = 0
    while response is None:
        try:
            status, response = request.next_chunk()
        except HttpError as e:
            if e.resp.status not in (500, 502, 503, 504):
                raise            # 4xx = permanent error, retry bekaar
            hard_fail += 1
            if hard_fail > 5:
                raise
            time.sleep(min(15, 3 * hard_fail))
            if hard_fail == 2:
                # resumable session kharab ho gayi -> naya session (progress reset, lekin survival)
                request = yt.videos().insert(part="snippet,status", body=body, media_body=media)
            print(f"    [!] HTTP {e.resp.status} — resume try {hard_fail}/5", flush=True)
            continue
        except (ConnectionError, socket.error, TimeoutError) as e:
            hard_fail += 1
            if hard_fail > 5:
                raise
            time.sleep(min(15, 3 * hard_fail))
            print(f"    [!] Network ({e!r}) — resume try {hard_fail}/5", flush=True)
            continue        # same request = same resumable session, wahi se continue
        if status:
            print(f"    {int(status.progress() * 100)}% uploaded", flush=True)

    vid = response.get("id")

    dur = script_data.get("duration_seconds") or 0
    if not dur:
        dur = load_last_video().get("duration_seconds", 0)
    is_long = vid and dur >= 180

    # custom thumbnail (per-channel)
    if use_thumb and vid:
        thumb_path = thumbnail_for(cname)
        if os.path.exists(thumb_path):
            try:
                yt.thumbnails().set(
                    videoId=vid,
                    media_body=MediaFileUpload(thumb_path, mimetype="image/jpeg"),
                ).execute()
                print(f"    Thumbnail set ✅ ({thumb_path})")
            except Exception as e:
                print(f"    [!] Thumbnail set fail: {e}")
                print("        token delete karke dobara run karo (naya scope chahiye: youtube.force-ssl)")

    if is_long:
        url = f"https://youtube.com/watch?v={vid}"
    else:
        url = f"https://youtube.com/shorts/{vid}" if vid else "unknown"
    print(f"    UPLOAD DONE [{cname}]: {url}", flush=True)
    return url


if __name__ == "__main__":
    data = load_last_video()
    path = data.get("video_file", "output/final.mp4")
    if not os.path.exists(path):
        path = "output/final.mp4"
    if not os.path.exists(path):
        print("[!] output video nahi mila. Pehle 'python main.py --no-upload' chalao.")
        sys.exit(1)
    ch = None
    if "--channel" in sys.argv:
        idx = sys.argv.index("--channel")
        if idx + 1 < len(sys.argv):
            ch = sys.argv[idx + 1]
    print(f"    Uploading: {path}")
    upload(path, data, channel=ch)