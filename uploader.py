"""uploader.py — YouTube Data API v3 se khud upload (pehli baar login, baad mein auto).
Upgrade v2:
  * made_for_kids flag (config: youtube.made_for_kids)
  * optional custom thumbnail upload (config: youtube.upload_thumbnail = true)
    NOTE: thumbnail ke liye extra scope "youtube.force-ssl" chahiye — naya login hoga.
  * video file path last_video_info.json se (hardcoded final.mp4 nahi)
"""
import json, os, socket, sys, time
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

CFG = json.load(open("config.json", encoding="utf-8"))
TOKEN_FILE = "token.json"
CLIENT_SECRETS = "client_secrets.json"
THUMBNAIL = "output/thumbnail.jpg"

_YOUTUBE_CFG = CFG.get("youtube", {})
USE_THUMBNAIL = bool(_YOUTUBE_CFG.get("upload_thumbnail", False))
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
if USE_THUMBNAIL:
    SCOPES.append("https://www.googleapis.com/auth/youtube.force-ssl")


def get_credentials():
    creds = None
    if os.path.exists(TOKEN_FILE):
        # NOTE: scopes param NAHI pass karte — warna original scopes overwrite ho jate hain
        # aur refresh par 'invalid_scope' error aata hai (refresh token sirf purane scope ke liye grant hua)
        creds = Credentials.from_authorized_user_file(TOKEN_FILE)
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception as e:
            print(f"    [!] Token refresh fail: {e}")
            creds = None
    if creds and creds.valid:
        have = set(creds.scopes or [])
        if set(SCOPES) <= have:
            return creds
        # scope kam hai (e.g. sirf upload, force-ssl nahi) -> naya consent chahiye
        print("    [!] Token scopes purane hain — naya login chahiye (thumbnail scope)")
        creds = None
    if not os.path.exists(CLIENT_SECRETS):
        raise Exception("client_secrets.json nahi mila! README ke Step 3 dekho (Google Cloud Console setup).")
    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS, SCOPES)
    creds = flow.run_local_server(port=0)  # browser khulega, ek baar login karna hai
    with open(TOKEN_FILE, "w") as f:
        f.write(creds.to_json())
    return creds


def load_last_video():
    if os.path.exists("last_video_info.json"):
        try:
            return json.load(open("last_video_info.json", encoding="utf-8"))
        except Exception:
            pass
    return {}


def upload(video_path, script_data):
    creds = get_credentials()
    yt = build("youtube", "v3", credentials=creds)

    tags = script_data.get("tags", []) + _YOUTUBE_CFG.get("tags_extra", [])
    body = {
        "snippet": {
            "title": script_data["title"][:100],
            "description": script_data["description"][:4900],
            "tags": tags[:30],
            "categoryId": _YOUTUBE_CFG.get("category_id", "28"),
        },
        "status": {
            "privacyStatus": _YOUTUBE_CFG.get("privacy", "unlisted"),
            "selfDeclaredMadeForKids": bool(_YOUTUBE_CFG.get("made_for_kids", False)),
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

    # custom thumbnail (optional)
    if USE_THUMBNAIL and vid and os.path.exists(THUMBNAIL):
        try:
            yt.thumbnails().set(
                videoId=vid,
                media_body=MediaFileUpload(THUMBNAIL, mimetype="image/jpeg"),
            ).execute()
            print("    Thumbnail set ✅")
        except Exception as e:
            print(f"    [!] Thumbnail set fail: {e}")
            print("        token.json delete karke dobara run karo (naya scope chahiye: youtube.force-ssl)")

    if is_long:
        url = f"https://youtube.com/watch?v={vid}"
    else:
        url = f"https://youtube.com/shorts/{vid}" if vid else "unknown"
    print(f"    UPLOAD DONE: {url}", flush=True)
    return url


if __name__ == "__main__":
    data = load_last_video()
    path = data.get("video_file", "output/final.mp4")
    if not os.path.exists(path):
        path = "output/final.mp4"
    if not os.path.exists(path):
        print("[!] output video nahi mila. Pehle 'python main.py --no-upload' chalao.")
        sys.exit(1)
    print(f"    Uploading: {path}")
    upload(path, data)