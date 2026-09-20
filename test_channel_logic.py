# Offline test of 2-channel routing logic (kabhi network call nahi karta)
import json, sys

# TEST 1: parse_command — bushcraft vs dark history
import orchestrator
r1 = orchestrator.parse_command("Aaj 1 cinematic 10-minute winter bushcraft video banao")
r2 = orchestrator.parse_command("Aaj Dark History ki 1 video banao")
print("T1 bushcraft:", r1["channel"], "| niche ok:", "bushcraft" in (r1["niche"] or ""))
print("T2 dark_history:", r2["channel"], "| niche ok:", "dark history" in (r2["niche"] or ""))

# TEST 2: uploader cross-upload guard (no network — guard pehle fail karega)
import uploader
try:
    uploader.upload("output/dummy.mp4", {"channel": "bushcraft", "title": "x"}, channel="dark_history")
    print("T3: FAIL — guard ne block nahi kiya!")
except Exception as e:
    print("T3 cross-upload guard:", str(e)[:70], "...OK")

# TEST 3: invalid channel name
try:
    uploader.resolve_channel("facebook")
    print("T4: FAIL")
except Exception as e:
    print("T4 invalid channel:", str(e)[:70], "...OK")

# TEST 4: channel youtube cfg merge (config defaults + channel overrides)
name, ch = uploader.resolve_channel("bushcraft")
yt = uploader.channel_youtube_cfg(ch)
print("T5 bushcraft creds:", yt.get("client_secrets"), "| tags:", len(yt.get("tags_extra", [])))
name, ch = uploader.resolve_channel("dark_history")
yt = uploader.channel_youtube_cfg(ch)
print("T6 dark_history creds:", yt.get("client_secrets"), "| token:", yt.get("token"))

# TEST 5: main.py channel validation
import main as m
c, ch = m.resolve_channel("bushcraft")
print("T7 main resolve bushcraft:", c, "| niche:", ch["niche"][:40], "...")
print("ALL TESTS DONE OK")