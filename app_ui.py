"""app_ui.py — Video Agent ka local web UI (Flask).

Run:   python app_ui.py        (phir browser mein http://127.0.0.1:5001 khulo)
Features:
  * Dashboard: config, last video, thumbnail preview, live log
  * Generate: topic do + video banao (NO upload — confirmation baad)
  * Upload: last video ko YouTube par bhejo (pehli baar browser login)
  * Quota guard: free API ~6 uploads/day — UI hat-tan se rokta hai
"""
import json, os, subprocess, sys, threading, datetime

from flask import Flask, render_template, request, jsonify

ROOT = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.join(ROOT, "config.json")
LOG_PATH = os.path.join(ROOT, "logs", "run.log")
UI_JOB = os.path.join(ROOT, "data", "ui_job.json")
QUOTA_LOG = os.path.join(ROOT, "data", "upload_log.json")
QUEUE_FILE = os.path.join(ROOT, "data", "job_queue.json")
MAX_UPLOADS_PER_DAY = 6

app = Flask(__name__, template_folder="ui/templates")
_lock = threading.Lock()


def now():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def job_state():
    if os.path.exists(UI_JOB):
        try:
            return json.load(open(UI_JOB, encoding="utf-8"))
        except Exception:
            return {}
    return {}


def set_job(**kw):
    st = job_state()
    st.update(kw)
    json.dump(st, open(UI_JOB, "w", encoding="utf-8"), indent=2)


def is_job_alive():
    st = job_state()
    pid = st.get("pid")
    if pid:
        try:
            if subprocess.run(["tasklist", "/FI", f"PID eq {pid}"],
                              capture_output=True, text=True).stdout.count("python.exe") > 0:
                return True
        except Exception:
            pass
    # Background resume render (resume_run.py) ko bhi active job dikhao
    try:
        out = subprocess.run(
            ["wmic", "process", "where", "name='python.exe'", "get", "CommandLine"],
            capture_output=True, text=True).stdout
        if "resume_run.py" in out:
            return True
    except Exception:
        pass
    return False


def tail(path, n=200):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return "".join(fh.readlines()[-n:])
    except Exception:
        return "(no log yet)"


def last_video():
    p = os.path.join(ROOT, "last_video_info.json")
    info = {}
    if os.path.exists(p):
        try:
            info = json.load(open(p, encoding="utf-8"))
        except Exception:
            info = {}
    vf = info.get("video_file")
    info["exists"] = bool(vf) and os.path.exists(os.path.join(ROOT, vf.replace("\\", os.sep)))
    if info.get("video_file"):
        info["filename"] = os.path.basename(info["video_file"])
    info["thumb_exists"] = os.path.exists(os.path.join(ROOT, "output", "thumbnail.jpg"))
    return info


def load_queue():
    if os.path.exists(QUEUE_FILE):
        try:
            return json.load(open(QUEUE_FILE, encoding="utf-8"))
        except Exception:
            return []
    return []


def save_queue(q):
    json.dump(q, open(QUEUE_FILE, "w", encoding="utf-8"), indent=2)


def pop_next_job():
    """Queue se pehla job nikalo (ya None)."""
    q = load_queue()
    if not q:
        return None
    job = q.pop(0)
    save_queue(q)
    return job


def uploads_today():
    try:
        rec = json.load(open(QUOTA_LOG, encoding="utf-8"))
    except Exception:
        return set()
    today = datetime.date.today().isoformat()
    return {d for d in rec if d == today}


def record_upload():
    rec = []
    if os.path.exists(QUOTA_LOG):
        try:
            rec = json.load(open(QUOTA_LOG, encoding="utf-8"))
        except Exception:
            rec = []
    rec.append(datetime.datetime.now().isoformat())
    json.dump(rec[-200:], open(QUOTA_LOG, "w", encoding="utf-8"), indent=2)


@app.route("/")
def index():
    cfg = json.load(open(CFG_PATH, encoding="utf-8"))
    return render_template("index.html", cfg=cfg, video=last_video(), job=job_state(),
                           quota_left=max(0, MAX_UPLOADS_PER_DAY - len(uploads_today())),
                           qmax=MAX_UPLOADS_PER_DAY, now=now())


@app.route("/api/status")
def api_status():
    # Render/resume progress bhi dikhao (agar chal raha ho to)
    render_log = ""
    for _p in ("logs/render_resume_v3.log", "logs/resume_run.log", "logs/ui_job.log"):
        if os.path.exists(os.path.join(ROOT, _p)):
            render_log = tail(os.path.join(ROOT, _p), 60)
            break
    # Auto-start: job idle + queue me kaam -> agli job chalao (brain automation)
    if not is_job_alive():
        job = pop_next_job()
        if job:
            import subprocess as _sp
            cmd = [sys.executable, "main.py", "--no-upload"]
            if job.get("topic"):
                cmd += ["--topic", job["topic"]]
            if job.get("niche"):
                cmd += ["--niche", job["niche"]]
            _sp.Popen(cmd, cwd=ROOT,
                      stdout=open(os.path.join(ROOT, "logs", "ui_job.log"), "wb"),
                      stderr=subprocess.STDOUT)
            set_job(running=True, start=now(), cmd=" ".join(cmd), kind="queued",
                    topic=job.get("topic"), niche=job.get("niche"))
    return jsonify({
        "job": job_state(),
        "alive": is_job_alive(),
        "log": tail(LOG_PATH, 120),
        "render_log": render_log,
        "video": last_video(),
        "quota_left": max(0, MAX_UPLOADS_PER_DAY - len(uploads_today())),
        "queue": load_queue(),
        "ts": now(),
    })


@app.route("/api/generate", methods=["POST"])
def api_generate():
    topic = (request.json or {}).get("topic", "").strip()
    privacy = (request.json or {}).get("privacy", "unlisted")
    with _lock:
        if is_job_alive():
            return jsonify({"ok": False, "error": "Pehle se ek job chal rahi hai — iske khatam hone ka intezar karo."})
        if not topic:
            return jsonify({"ok": False, "error": "Topic khali hai."})
        cfg = json.load(open(CFG_PATH, encoding="utf-8"))
        if privacy not in ("public", "unlisted", "private"):
            privacy = "unlisted"
        cfg.setdefault("youtube", {})["privacy"] = privacy
        json.dump(cfg, open(CFG_PATH, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        cmd = [sys.executable, "main.py", "--no-upload", "--topic", topic]
        if (request.json or {}).get("niche"):
            cmd += ["--niche", (request.json or {}).get("niche")]
        proc = subprocess.Popen(cmd, cwd=ROOT,
                                stdout=open(os.path.join(ROOT, "logs", "ui_job.log"), "wb"),
                                stderr=subprocess.STDOUT)
        set_job(running=True, pid=proc.pid, start=now(), cmd=" ".join(cmd), kind="generate",
                topic=topic, niche=(request.json or {}).get("niche"))
        return jsonify({"ok": True, "started": True, "pid": proc.pid})


@app.route("/api/upload", methods=["POST"])
def api_upload():
    with _lock:
        if is_job_alive():
            return jsonify({"ok": False, "error": "Job chhali rahi hai — pehle ise rokho/complete hone do."})
        used = len(uploads_today())
        if used >= MAX_UPLOADS_PER_DAY:
            return jsonify({"ok": False, "error": f"Quota khatam ({used}/{MAX_UPLOADS_PER_DAY} aaj). Kal tak ruko ya naya API key."})
        v = last_video()
        if not v.get("exists"):
            return jsonify({"ok": False, "error": "Video nahi mili pehle generate karo."})
        def _run():
            try:
                with open(os.path.join(ROOT, "logs", "ui_upload.log"), "wb") as fh:
                    subprocess.run([sys.executable, "uploader.py"], cwd=ROOT, stdout=fh, stderr=subprocess.STDOUT)
                record_upload()
            finally:
                set_job(running=False, end=now())
        set_job(running=True, pid=os.getpid(), start=now(), cmd="uploader.py", kind="upload")
        threading.Thread(target=_run, daemon=True).start()
        return jsonify({"ok": True})
    return jsonify({"ok": False})  # unreachable


@app.route("/api/cancel", methods=["POST"])
def api_cancel():
    st = job_state()
    pid = st.get("pid")
    try:
        subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True)
        set_job(running=False, end=now(), cancelled=True)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


@app.route("/api/quickgen", methods=["POST"])
def api_quickgen():
    """Niche preset + optional topic -> queue/generate. (Phase 2: brain command)"""
    data = request.json or {}
    niche = (data.get("niche") or "").strip()
    topic = (data.get("topic") or "").strip()
    with _lock:
        if is_job_alive():
            q = load_queue()
            q.append({"topic": topic or None, "niche": niche or None,
                      "queued_at": now(), "status": "queued", "source": "ui"})
            save_queue(q)
            return jsonify({"ok": True, "queued": True, "queue": q})
        cmd = [sys.executable, "main.py", "--no-upload"]
        if topic:
            cmd += ["--topic", topic]
        if niche:
            cmd += ["--niche", niche]
        proc = subprocess.Popen(cmd, cwd=ROOT,
                                stdout=open(os.path.join(ROOT, "logs", "ui_job.log"), "wb"),
                                stderr=subprocess.STDOUT)
        set_job(running=True, pid=proc.pid, start=now(), cmd=" ".join(cmd), kind="generate",
                topic=topic, niche=niche)
        return jsonify({"ok": True, "started": True, "pid": proc.pid})


@app.route("/api/ideas")
def api_ideas():
    import orchestrator
    lst = orchestrator.ideas(6)
    return jsonify({"ideas": lst})


@app.route("/api/analytics")
def api_analytics():
    from analytics import fetch_stats
    return jsonify(fetch_stats())


@app.route("/thumb")
def thumb():
    from flask import send_file
    path = os.path.join(ROOT, "output", "thumbnail.jpg")
    if os.path.exists(path):
        return send_file(path, mimetype="image/jpeg")
    return "no thumbnail", 404


@app.route("/video")
def video_file():
    """Last video ka preview (confirm se pehle dekhne ke liye)."""
    from flask import send_file, abort
    info = last_video()
    vf = info.get("video_file")
    if vf and os.path.exists(os.path.join(ROOT, vf.replace("\\", os.sep))):
        return send_file(os.path.join(ROOT, vf.replace("\\", os.sep)), mimetype="video/mp4")
    abort(404)


if __name__ == "__main__":
    print("UI ready -> http://127.0.0.1:5001")
    app.run(host="127.0.0.1", port=5001, debug=False)
