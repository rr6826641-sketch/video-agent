"""
bridge_server.py - the wire between the browser agent (unified-agent) and the
real YouTube uploader (uploader.py).

Why this exists
---------------
Agent A ("Wildline Studio") renders a genuine video on-device but only FAKED
the upload. Agent B ("NORTHPINE") simulated everything. The Python video-agent
is the only component with a real OAuth uploader. This bridge accepts the
rendered master + upload card from the web UI and runs the genuine upload.

Run:
    python bridge_server.py            # http://127.0.0.1:5055
Then open http://127.0.0.1:5055 in the browser (serves the app same-origin).

Endpoints:
    GET  /api/health     -> { ok, version, channels, default_channel }
    POST /api/publish    -> multipart (video, title, description, tags,
                            visibility, madeForKids, channel, thumbnail)
                            -> real YouTube upload, returns { ok, videoId, url }
"""
import json
import os
import shutil
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)  # uploader.py resolves config.json / channels.json / output/ from CWD

from flask import Flask, jsonify, request, send_from_directory  # noqa: E402

# serve the web app same-origin if it has been built
_WEB_CANDIDATES = [
    os.path.normpath(os.path.join(HERE, "unified-agent", "dist")),      # in-repo build
    os.path.normpath(os.path.join(HERE, "..", "unified-agent", "dist")),  # sibling build
]
WEB_DIST = next((d for d in _WEB_CANDIDATES if os.path.isdir(d)), _WEB_CANDIDATES[0])

app = Flask(__name__)
VERSION = "1.0.0"


def _channels():
    try:
        cfg = json.load(open("channels.json", encoding="utf-8"))
        return cfg.get("channels", {}), cfg.get("default_channel", "default")
    except Exception:
        return {}, "default"


@app.after_request
def _cors(resp):
    # allow the UI served from file:// or another local port
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    return resp


@app.route("/api/health", methods=["GET", "OPTIONS"])
def health():
    if request.method == "OPTIONS":
        return ("", 204)
    chans, default = _channels()
    return jsonify({
        "ok": True,
        "version": VERSION,
        "channels": list(chans.keys()),
        "default_channel": default,
    })


def _remux_to_mp4(src, channel):
    """webm -> mp4 remux (stream copy) when ffmpeg is available. Best effort."""
    try:
        import imageio_ffmpeg  # bundled with the pipeline
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if not exe or not os.path.exists(exe):
            return None
        dst = os.path.join("output", f"bridge_{channel}_{int(time.time())}.mp4")
        import subprocess
        subprocess.run(
            [exe, "-y", "-i", src, "-c", "copy", "-movflags", "+faststart", dst],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if os.path.exists(dst) and os.path.getsize(dst) > 0:
            return dst
    except Exception as e:
        print(f"    [!] remux skipped: {e}", flush=True)
    return None


@app.route("/api/publish", methods=["POST", "OPTIONS"])
def publish():
    if request.method == "OPTIONS":
        return ("", 204)

    f = request.files.get("video")
    if not f:
        return jsonify({"ok": False, "error": "no video file in request"}), 400

    channel = (request.form.get("channel") or "").strip()
    title = (request.form.get("title") or "").strip()
    description = request.form.get("description") or ""
    try:
        tags = json.loads(request.form.get("tags") or "[]")
    except Exception:
        tags = []
    visibility = (request.form.get("visibility") or "").strip()
    made_for_kids = str(request.form.get("madeForKids", "false")).lower() == "true"
    ext = (request.form.get("extension") or "webm").strip().lstrip(".")

    chans, default_channel = _channels()
    if channel not in chans:
        # web agent channels (bushcraft / homestead / overland) -> pick bushcraft, else default
        channel = "bushcraft" if "bushcraft" in chans else default_channel

    os.makedirs("output", exist_ok=True)
    raw_path = os.path.join("output", f"bridge_in_{int(time.time())}.{ext}")
    f.save(raw_path)
    size_mb = os.path.getsize(raw_path) / 1024 / 1024
    print(f"[bridge] received {raw_path} ({size_mb:.1f} MB) channel={channel}", flush=True)

    # optional thumbnail -> output/thumbnail_<channel>.jpg (uploader picks it up)
    thumb = request.files.get("thumbnail")
    if thumb:
        tmp_thumb = os.path.join(tempfile.gettempdir(), "bridge_thumb.png")
        thumb.save(tmp_thumb)
        try:
            from PIL import Image
            dst = os.path.join("output", f"thumbnail_{channel}.jpg")
            Image.open(tmp_thumb).convert("RGB").save(dst, "JPEG", quality=92)
            print(f"    thumbnail -> {dst}", flush=True)
        except Exception as e:
            print(f"    [!] thumbnail convert failed: {e}", flush=True)

    video_path = raw_path
    if ext in ("webm", "mkv"):
        mp4 = _remux_to_mp4(raw_path, channel)
        if mp4:
            video_path = mp4
            print(f"    remuxed -> {mp4}", flush=True)

    # real upload
    try:
        import uploader
    except Exception as e:
        return jsonify({"ok": False, "error": f"uploader import failed: {e}"}), 500

    # honour the UI's visibility + made-for-kids (override channel config in memory)
    try:
        yt = uploader.CHANNELS_CFG["channels"][channel].setdefault("youtube", {})
        if visibility in ("public", "unlisted", "private"):
            yt["privacy"] = visibility
        yt["made_for_kids"] = made_for_kids
    except Exception as e:
        print(f"    [!] config override skipped: {e}", flush=True)

    script_data = {
        "channel": channel,
        "title": title or "Untitled",
        "description": description,
        "tags": tags,
    }

    try:
        url = uploader.upload(video_path, script_data, channel=channel)
    except Exception as e:
        return jsonify({"ok": False, "error": f"upload failed: {e}"}), 500

    vid = ""
    if url and "v=" in url:
        vid = url.split("v=")[-1].split("&")[0]
    elif url and "/shorts/" in url:
        vid = url.split("/shorts/")[-1].split("?")[0]

    return jsonify({"ok": True, "videoId": vid, "url": url,
                    "message": f"Uploaded to {channel} ({visibility or 'channel default'})"})


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def web(path):
    if not os.path.isdir(WEB_DIST):
        return (
            "<h2>Bridge is up, but the web build was not found.</h2>"
            "<p>Run <code>npm run build</code> in <code>unified-agent</code>, "
            "or use the standalone <code>dist/index.html</code> and point it at "
            "<code>http://127.0.0.1:5055</code>.</p>",
            200,
        )
    if path and os.path.exists(os.path.join(WEB_DIST, path)):
        return send_from_directory(WEB_DIST, path)
    return send_from_directory(WEB_DIST, "index.html")


if __name__ == "__main__":
    port = 5055
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    print("=" * 60)
    print(f" VIDEO AGENT BRIDGE v{VERSION}  ->  http://127.0.0.1:{port}")
    print(f" web build: {WEB_DIST}  ({'found' if os.path.isdir(WEB_DIST) else 'MISSING'})")
    chans, default = _channels()
    print(f" channels: {list(chans.keys())} (default: {default})")
    print("=" * 60)
    app.run(host="127.0.0.1", port=port, threaded=True)
