"""link_youtube.py — YouTube OAuth manual login helper (browser redirect issue ke liye).
    URL print hota hai -> aap browser mein kholo -> login -> ALLOW ->
    redirect hokar code milega -> code terminal mein paste karo -> token ban jayega.

2-CHANNEL MODE:
    python link_youtube.py                      -> purana default (config.json, token.json)
    python link_youtube.py --channel bushcraft   -> channels/bushcraft/token.json
    python link_youtube.py --channel dark_history -> channels/dark_history/token.json

    HAR CHANNEL ka apna Google account login karo (wo account jis per wo channel hai).
    Isi liye cross-upload nahi ho sakta — bushcraft token bushcraft account ka hota hai.
"""
import json, os, re, sys
from google_auth_oauthlib.flow import InstalledAppFlow

CHANNELS_CFG = json.load(open("channels.json", encoding="utf-8")) if os.path.exists("channels.json") else {}

SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.force-ssl"]


def main(channel=None):
    client_secrets = "client_secrets.json"
    token_file = "token.json"
    label = "default"

    if channel:
        ch = CHANNELS_CFG.get("channels", {}).get(channel)
        if not ch:
            print(f"[!] Channel '{channel}' channels.json mein nahi hai. Available: {list(CHANNELS_CFG.get('channels', {}))}")
            sys.exit(1)
        yt = ch.get("youtube", {})
        client_secrets = yt.get("client_secrets", client_secrets)
        token_file = yt.get("token", token_file)
        label = f"{ch.get('name', channel)} ({channel})"

    if not os.path.exists(client_secrets):
        print(f"[!] {client_secrets} nahi mila! us channel ka OAuth client setup karo (README Step 3).")
        sys.exit(1)

    flow = InstalledAppFlow.from_client_secrets_file(client_secrets, SCOPES)
    flow.redirect_uri = "http://localhost"

    auth_url, _ = flow.authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="true"
    )

    print("=" * 62)
    print(f"  CHANNEL: {label}")
    print(f"  Token file: {token_file}")
    print("-" * 62)
    print("  STEP 1: Ye URL copy karo aur browser mein kholo:")
    print("=" * 62)
    print(auth_url)
    print("=" * 62)
    print("  Google login karo -> ALLOW dabao.")
    print("  Phir browser 'localhost' par nahi khulega (ye NORMAL hai).")
    print("  Address bar se poori URL copy karo jismein 'code=' dikhe.")
    print("=" * 62)

    code = None
    while not code:
        raw = input("STEP 2: Wo URL paste karo (jismein code= hai): ").strip()
        m = re.search(r"[?&]code=([^&]+)", raw)
        if m:
            code = m.group(1)
        elif re.search(r"^[0-9]/[A-Za-z0-9_\-\.]+$", raw):
            code = raw  # sirf code bhi chalega
        else:
            print("[!] Code nahi mila. Poora URL paste karo ya sirf code value.")

    try:
        flow.fetch_token(code=code)
        creds = flow.credentials
        os.makedirs(os.path.dirname(os.path.abspath(token_file)), exist_ok=True)
        with open(token_file, "w") as f:
            f.write(creds.to_json())
        print()
        print(f"OK! {token_file} ban gaya. '{label}' channel ab linked hai.")
        print(f"Test karne ke liye:  python uploader.py --channel {channel or 'default'}")
    except Exception as e:
        print(f"[!] Token exchange fail: {e}")
        print("    Code expire ho gaya ho to dobara run karo (naya URL milega).")


if __name__ == "__main__":
    ch = None
    if "--channel" in sys.argv:
        idx = sys.argv.index("--channel")
        if idx + 1 < len(sys.argv):
            ch = sys.argv[idx + 1]
    main(channel=ch)