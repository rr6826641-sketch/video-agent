"""orchestrator.py — AGENT BRAIN / Command Center (Phase 1-2 ka core).

Ek natural command se poora pipeline chalti hai:
    RESEARCH -> SCRIPT -> VOICE -> VISUALS -> EDIT -> THUMBNAIL -> SEO -> REVIEW -> UPLOAD -> ANALYTICS -> IDEAS

Examples:
    python orchestrator.py "Aaj Dark History ki 1 video banao"
    python orchestrator.py "dark history video banao"
    python orchestrator.py "history banao"
    python orchestrator.py --scan                        # status + queue dekho
    python orchestrator.py --queue                       # queue list karo
    python orchestrator.py --ideas 5                     # Gemini se agli video ke ideas
    python orchestrator.py --analytics                   # last uploaded video ka data

Flow:
  * Command parse (Urdu/English filler words hatao, niche preset map karo)
  * Agar pehle se job chal rahi hai -> job_queue.json mein daal do
  * Warna directly main.py spawn karo (NO auto-upload — hamesha review pehle)
  * UI (app_ui.py) jab job idle hote dekhata hai to queue se agli job auto-start karta hai
"""
import json, os, subprocess, sys, datetime, re

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
QUEUE = os.path.join(ROOT, "data", "job_queue.json")
CFG_PATH = os.path.join(ROOT, "config.json")

# ---- Niche presets: keyword -> (niche, default_topic) -----------------------
NICHE_PRESETS = [
    (["dark history", "darkhistory", "dark"], "dark history, true crime history, dark and mysterious historical events",
     None),
    (["ancient", "mystery", "mysteries", "unsolved"], "ancient mysteries, unsolved historical mysteries",
     None),
    (["true crime", "crime"], "historical true crime, famous criminals and murders in history",
     None),
    (["war", "battle"], "history of wars and battles, military history",
     None),
    (["empire"], "great empires of history, rise and fall of empires",
     None),
]

STOPWORDS = set("aaj aj ajaa kal kl ki ka ke ko se mein me mien hum humein hume mujhe mjhe"
                "tum tumhe apna apni apne yie ye yeh ek 1 eik aik video videos banao bana banaiye"
                "banaye banani banaw kar kro karo do de dega degi chahiye chaheye chahie today make"
                "create mera meri please plz bhai jan jani the a an of on for and or in".split())


def load_queue():
    if os.path.exists(QUEUE):
        try:
            return json.load(open(QUEUE, encoding="utf-8"))
        except Exception:
            return []
    return []


def save_queue(q):
    os.makedirs(os.path.dirname(QUEUE), exist_ok=True)
    json.dump(q, open(QUEUE, "w", encoding="utf-8"), indent=2)


def job_running():
    """Koi python pipeline (main.py / resume_run.py) chal raha hai?"""
    try:
        out = subprocess.run(["wmic", "process", "where", "name='python.exe'", "get", "CommandLine"],
                             capture_output=True, text=True).stdout
        for prog in ("main.py", "resume_run.py"):
            if prog in out:
                return prog
    except Exception:
        pass
    return None


def parse_command(raw):
    """'Aaj Dark History ki 1 video banao' -> {niche, topic, raw}"""
    text = (raw or "").strip()
    lower = text.lower()
    niche_preset = None
    topic_override = None
    for kws, niche, def_topic in NICHE_PRESETS:
        if any(k in lower for k in kws):
            niche_preset = niche
            topic_override = def_topic
            break
    # topic extraction: filler words hatao, jo bache wo specific topic ho sakta hai
    tokens = [t for t in re.split(r"[\s,.;:!?]+", lower) if t not in STOPWORDS]
    bare = " ".join(tokens)
    if niche_preset and ("video" in bare or not bare):
        bare = ""
    topic = topic_override or (bare or None)
    return {"raw": raw, "niche": niche_preset, "topic": topic, "text": bare}


def spawn_job(job):
    """main.py --no-upload spawn karo (review pehle, upload baad confirm par)."""
    cmd = [sys.executable, "main.py", "--no-upload"]
    if job.get("topic"):
        cmd += ["--topic", job["topic"]]
    if job.get("niche"):
        cmd += ["--niche", job["niche"]]
    log_path = os.path.join(ROOT, "logs", "orchestrator_job.log")
    proc = subprocess.Popen(cmd, cwd=ROOT,
                            stdout=open(log_path, "wb"), stderr=subprocess.STDOUT)
    job["pid"] = proc.pid
    job["started_at"] = datetime.datetime.now().isoformat()
    return proc.pid


def run_command(raw, count=1):
    parsed = parse_command(raw)
    q = load_queue()
    jobs = []
    for _ in range(count):
        job = {"topic": parsed["topic"], "niche": parsed["niche"], "raw": raw,
               "queued_at": datetime.datetime.now().isoformat(), "status": "queued"}
        running = job_running()
        if running:
            q.append(job)
            job["status"] = "queued"
            jobs.append(job)
            print(f"[QUEUE] Job queue mein daal di (current job: {running})")
        else:
            pid = spawn_job(job)
            job["status"] = "running"
            job["pid"] = pid
            print(f"[START] Video process start (PID {pid}) — NO upload, review pehle.")
            jobs.append(job)
    save_queue(q)
    return jobs, parsed


def ideas(n=5, niche=None):
    """Gemini se agli N video ke ideas (titles + 1-line angles)."""
    import requests
    cfg = json.load(open(CFG_PATH, encoding="utf-8"))
    key = cfg.get("gemini_api_key", "")
    if not key or "YAHAN" in key:
        return [{"error": "gemini_api_key config mein set nahi hai"}]
    model = cfg.get("gemini_model", "gemini-3.6-flash")
    cur = niche or cfg.get("niche", "history")
    n2 = min(max(int(n), 1), 10)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    prompt = (f"You are a YouTube strategist for the niche: '{cur}'. "
              f"Suggest {n2} fresh video ideas (not already overdone). "
              "Return ONLY JSON: {\"ideas\": [{\"title\": \"...\", \"angle\": \"1-line why it will perform\"}]} "
              "Titles max 90 chars, clickbait-but-honest.")
    try:
        r = requests.post(url, params={"key": key},
                          json={"contents": [{"parts": [{"text": prompt}]}],
                                "generationConfig": {"response_mime_type": "application/json",
                                                     "temperature": 0.95}},
                          timeout=60)
        r.raise_for_status()
        data = json.loads(r.json()["candidates"][0]["content"]["parts"][0]["text"])
        return data.get("ideas", [])
    except Exception as e:
        return [{"error": f"idea generation fail: {e}"}]


def analytics():
    """Last uploaded video ke stats (views/likes/comments). Scope com ho to batao."""
    from analytics import fetch_stats
    return fetch_stats()


def main():
    argv = sys.argv[1:]
    if not argv:
        print(__doc__)
        return
    a0 = argv[0]
    if a0 in ("--scan", "--queue"):
        q = load_queue()
        print(json.dumps({"running": job_running(), "queue": q}, indent=2, ensure_ascii=False))
    elif a0 == "--ideas":
        n = int(argv[1]) if len(argv) > 1 and argv[1].isdigit() else 5
        niche = argv[2] if len(argv) > 2 else None
        for it in ideas(n, niche):
            print("- " + it.get("title", "?") + (f"  [{it.get('angle','')}]" if it.get("angle") else ""))
    elif a0 == "--analytics":
        print(json.dumps(analytics(), indent=2, ensure_ascii=False))
    elif a0.startswith("--"):
        print("Unknown flag:", a0)
        print(__doc__)
    else:
        raw = " ".join(argv)
        run_command(raw)
        print("[DONE] Command accept ho gayi. UI: http://127.0.0.1:5001")


if __name__ == "__main__":
    main()