"""link_youtube.py — YouTube OAuth manual login helper (browser redirect issue ke liye).
    URL print hota hai -> aap browser mein kholo -> login -> ALLOW ->
    redirect hokar code milega -> code terminal mein paste karo -> token.json ban jayega.
    Phir uploader.py automatically token.json use karega.
"""
import json, os, re, sys
from google_auth_oauthlib.flow import InstalledAppFlow

CLIENT_SECRETS = "client_secrets.json"
TOKEN_FILE = "token.json"
SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.force-ssl"]

def main():
    if not os.path.exists(CLIENT_SECRETS):
        print("[!] client_secrets.json nahi mila!")
        sys.exit(1)

    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS, SCOPES)
    flow.redirect_uri = "http://localhost"

    auth_url, _ = flow.authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="true"
    )

    print("=" * 62)
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
        # google-auth lib me hamesha refresh_token nahi aata, agar missing ho to
        # oauth2 consent screen dump se bhi kaam nahi chalta; isliye prompt=consent rakha hai.
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
        print()
        print("OK! token.json ban gaya. Ab YouTube link ho gaya hai.")
        print("Test karne ke liye:  python uploader.py")
    except Exception as e:
        print(f"[!] Token exchange fail: {e}")
        print("    Code expire ho gaya ho to dobara run karo (naya URL milega).")

if __name__ == "__main__":
    main()