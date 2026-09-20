"""start_unified.py - one-click launcher for the UNIFIED video agent.

Ye bridge_server.py ko start karta hai (jo web UI ko same-origin serve karta hai
aur real YouTube uploader se juda hai), health ka wait karta hai, phir browser
khol deta hai. Isi ek command se: render-in-browser -> review -> real upload.
"""
import os, subprocess, sys, time, webbrowser, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
URL = "http://127.0.0.1:5055"

print("=" * 56)
print(" UNIFIED VIDEO AGENT launcher")
print("=" * 56)

proc = subprocess.Popen([sys.executable, "bridge_server.py"])
opened = False
for _ in range(60):  # up to ~30s
    try:
        urllib.request.urlopen(URL + "/api/health", timeout=1)
        try:
            webbrowser.open(URL)
            opened = True
        except Exception:
            pass
        print(f"\n  READY -> {URL}   (browser {'opened' if opened else 'ka manually kholo'})")
        print("  Band karne ke liye Ctrl+C dabao.\n")
        break
    except Exception:
        time.sleep(0.5)
else:
    print("  [!] Bridge 30s mein ready nahi hua. Window par errors dekho.")

try:
    proc.wait()
except KeyboardInterrupt:
    proc.terminate()
