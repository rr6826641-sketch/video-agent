=== CHANNELS SETUP (2-channel safe mode) ===

Har channel ka APNA Google OAuth client + token hota hai. Isi wajah se
cross-upload NAHI ho sakta: bushcraft token bushcraft Google account ka
hai, dark_history token dark history channel ke account ka.

1) channels.json mein har channel ye files expect karta hai:
   channels/bushcraft/client_secrets.json   <- Google Cloud console ka OAuth JSON
                                              (us Google account se jis par bushcraft channel hai)
   channels/bushcraft/token.json            <- auto-banega login ke baad
   channels/dark_history/client_secrets.json
   channels/dark_history/token.json

2) Google Cloud: naya project (ya alag OAuth client) -> YouTube Data API v3 enable
   -> Credentials > OAuth client ID > Desktop app -> JSON download karo
   -> channels/<channel>/ mein client_secrets.json naam se rakho.

3) Login (har channel ek baar):
   python link_youtube.py --channel bushcraft
   python link_youtube.py --channel dark_history

4) Channel-specific video banao:
   python main.py --no-upload --channel bushcraft --topic "winter snow shelter build"
   python main.py --channel dark_history

5) Upload confirm (sirf usi channel ke account par jayega):
   python uploader.py --channel bushcraft
   python uploader.py --channel dark_history

SAFETY GUARD: agar video 'bushcraft' channel ke liye bani ho aur upload
'--channel dark_history' se karo, to uploader turant ruk jata hai:
"CROSS-UPLOAD BLOCKED". Koi silent fallback nahi hai.