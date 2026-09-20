"""test_multikey.py — Gemini multi-key rotation + render config ka offline test.
Koi asli network call nahi — requests.post monkeypatch ki jati hai."""
import requests
import script_maker as sm

FAIL = {"k1", "k2"}          # ye keys 429 denge
calls = []


class _FakeResp:
    def __init__(self, payload):
        self._p = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._p


def fake_post(url, params=None, json=None, timeout=None):
    key = (params or {}).get("key")
    calls.append(key)
    if key in FAIL:
        raise requests.exceptions.HTTPError("429 Client Error: Too Many Requests for url")
    return _FakeResp({"candidates": [{"content": {"parts": [{"text": '{"ok": true}'}]}}]})


def main():
    sm.requests.post = fake_post
    sm._KEY_COOLDOWN.clear()
    sm._KEY_RR["i"] = 0
    sm.CFG["gemini_api_key"] = ""   # test: sirf fake keys use hon
    sm.CFG["gemini_api_keys"] = ["k1", "k2", "k3"]
    sm.CFG["gemini_key_cooldown_seconds"] = 600

    keys = sm._load_keys()
    assert "k3" in keys and "k1" in keys, f"keys load fail: {keys}"
    print("1) keys load ok:", keys)

    out = sm.gemini_call("hello", attempts=3)
    assert out == '{"ok": true}', f"rotation fail, got {out!r}"
    print("2) rotation ok — call order:", calls)
    assert "k1" in sm._KEY_COOLDOWN and "k2" in sm._KEY_COOLDOWN, "429 keys cooldown mein nahi"
    print("3) exhausted keys cooldown ok:", list(sm._KEY_COOLDOWN))
    assert "k3" not in sm._KEY_COOLDOWN, "successful key ko cooldown nahi hona chahiye"

    # k3 healthy — dobara call bhi turant succeed kare (cooldown keys skip)
    calls.clear()
    out2 = sm.gemini_call("again", attempts=1)
    assert out2 is not None and calls == ["k3"], f"cooldown skip fail: {calls}"
    print("4) cooldown skip ok:", calls)

    # render config values sanity
    import video_maker as vm
    assert vm.RENDER_PRESET in ("ultrafast", "superfast", "veryfast", "faster", "fast", "medium")
    assert int(vm.RENDER_CRF) >= 18
    assert vm.RENDER_THREADS >= 1
    print("5) render config ok: preset=%s crf=%s threads=%s norm=%s tgtH=%s"
          % (vm.RENDER_PRESET, vm.RENDER_CRF, vm.RENDER_THREADS, vm.NORMALIZE_CLIPS, vm.CLIP_TARGET_H))

    print("\nALL TESTS PASSED")


if __name__ == "__main__":
    main()
