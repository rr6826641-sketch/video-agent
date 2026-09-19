"""analytics.py — Uploaded videos ke stats (views, likes, comments) + agle ideas.

NOTE: videos.list ke liye scope chahiye: youtube.readonly ya youtube.
      Agar token mein sirf youtube.upload hai to error clear message aayega —
      uploader.py ke SCOPES mein read scope add karke naya login karna hoga.

Run: python analytics.py            (last uploaded video ka data)
     python orchestrator.py --analytics
"""
import json, os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

ROOT = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(ROOT, "token.json")
SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]


def get_credentials():
    if not os.path.exists(TOKEN_FILE):
        return None, "token.json nahi mila — pehle ek video upload karo (uploader.py login)."
    creds = Credentials.from_authorized_user_file(TOKEN_FILE)
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception as e:
            return None, f"token refresh fail: {e}"
    if creds and creds.valid:
        have = set(creds.scopes or [])
        ok = have & {"https://www.googleapis.com/auth/youtube.readonly",
                     "https://www.googleapis.com/auth/youtube",
                     "https://www.googleapis.com/auth/youtube.force-ssl"}
        if ok:
            return creds, None
        return None, ("Token scopes me read access nahi (sirf upload). "
                      "Fix: uploader.py ke SCOPES mein 'youtube.readonly' add karo, "
                      "token.json delete karo, dobara login karo.")
    return None, "credentials valid nahi hain — naya login chahiye."


def fetch_stats():
    """last_video_info.json se video id -> stats. Channel ke recent uploads bhi le sakte hain."""
    info_path = os.path.join(ROOT, "last_video_info.json")
    info = {}
    if os.path.exists(info_path):
        try:
            info = json.load(open(info_path, encoding="utf-8"))
        except Exception:
            pass
    video_id = info.get("youtube_id") or info.get("video_id")
    if not video_id:
        url = info.get("youtube_url", "")
        if "v=" in url:
            video_id = url.split("v=")[1].split("&")[0]
        elif "/shorts/" in url:
            video_id = url.split("/shorts/")[1].split("?")[0]
    if not video_id:
        return {"ok": False, "error": "last_video_info.json me youtube_id/url nahi — pehle upload karo."}

    creds, err = get_credentials()
    if err:
        return {"ok": False, "error": err}
    try:
        yt = build("youtube", "v3", credentials=creds, cache_discovery=False)
        resp = yt.videos().list(part="statistics,snippet,contentDetails",
                                id=video_id).execute()
        items = resp.get("items", [])
        if not items:
            return {"ok": False, "error": f"video {video_id} nahi mili (private/na ho)."}
        it = items[0]
        st = it.get("statistics", {})
        sn = it.get("snippet", {})
        return {"ok": True,
                "video_id": video_id,
                "title": sn.get("title"),
                "published": sn.get("publishedAt"),
                "views": int(st.get("viewCount", 0)),
                "likes": int(st.get("likeCount", 0)),
                "comments": int(st.get("commentCount", 0)),
                "duration": it.get("contentDetails", {}).get("duration")}
    except Exception as e:
        return {"ok": False, "error": f"API call fail: {e}"}


def _stats_line(st):
    if not st.get("ok"):
        return st["error"]
    return (f"'{st['title']}'  |  views {st['views']:,}  |  likes {st['likes']:,}  |  "
            f"comments {st['comments']:,}  |  {st.get('duration')}")


if __name__ == "__main__":
    import sys
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    st = fetch_stats()
    print(_stats_line(st))