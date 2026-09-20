"""script_maker.py — Gemini se viral script + title + tags + visual keywords.
Upgrade v3 (history long-form):
  * LONG-FORM documentary prompt (niche se, exact n sentences)
  * retry-if-too-short + zyada robust retries (5x backoff)
  * fallback = HISTORY long-form segments (6 eras x 20 sentences = 120)
    — Gemini bilkul down ho tab bhi 10+ min history script banti hai

Run: python script_maker.py                (random/naya topic)
     python script_maker.py "my topic"     (khaas topic)
"""
import json, os, random, sys, time, requests

CFG = json.load(open("config.json", encoding="utf-8"))
USED_TOPICS_FILE = "used_topics.json"
GEMINI_MODEL = CFG.get("gemini_model", "gemini-3.6-flash")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

# ---- History long-form fallback (Gemini bilkul down ho tab) -----------------
# 6 eras, har ek 20 sentences (pehla sentence naya segment introduce karta hai)
HISTORY_SEGMENTS = [
    {
        "topic": "The Roman Colosseum and the engineering of an empire",
        "sentences": [
            "Deep beneath the Roman Colosseum lies a hidden world of machines and slaves.",
            "Nearly two thousand years ago, an emperor ordered this massive arena to be built.",
            "The site was once a drained lake inside the heart of Rome.",
            "Roman engineers poured a foundation ring of concrete that still holds today.",
            "That concrete was made with volcanic ash, which set even under water.",
            "Travertine limestone blocks were hauled from quarries twenty miles away.",
            "Iron clamps locked the giant stones together without any mortar.",
            "Over three hundred tons of iron held the outer walls in place.",
            "Seventy-six numbered entrances let fifty thousand spectators pour inside.",
            "A retractable canvas roof called the velarium shielded the crowd from the sun.",
            "Underground, elevators and pulleys lifted animals into the arena floor.",
            "The floodable arena even hosted mock naval battles for the emperor.",
            "Gladiators fought wild beasts shipped from Africa and Asia.",
            "The Colosseum survived earthquakes and fires that shattered smaller buildings.",
            "Medieval builders stripped its stones, yet the skeleton refused to fall.",
            "Modern engineers still study its drainage system with admiration.",
            "It remains the largest ancient amphitheater ever constructed.",
            "Today millions visit the monument that defined Roman power.",
            "Its story proves that good engineering outlives even empires.",
            "Subscribe now for more incredible stories from world history!",
        ],
        "visual_keywords": [
            "roman colosseum aerial view", "ancient rome ruins", "colosseum interior arches", "roman concrete wall texture",
            "volcanic ash stone quarry", "travertine limestone blocks", "iron clamp ancient masonry", "colosseum outer wall closeup",
            "colosseum arches corridor", "roman sailcloth canopy", "ancient roman elevator ropes", "colosseum underground tunnels",
            "gladiator arena sand", "wild lion cage bars", "colosseum damaged wall", "colosseum modern day tourists",
            "roman amphitheater drone", "colosseum night lights", "ancient stone engineering site", "roman empire documentary footage",
        ],
    },
    {
        "topic": "The Great Pyramid of Giza and ancient Egyptian mysteries",
        "sentences": [
            "But now let us travel south to Egypt, where another wonder still stands.",
            "The Great Pyramid of Giza was built more than four thousand years ago.",
            "It stayed the tallest structure on Earth for almost four thousand years.",
            "More than two million stone blocks weight an average of two and a half tons.",
            "Ancient builders aligned the pyramid to true north within a tiny fraction of a degree.",
            "No one knows exactly how those blocks were lifted into place.",
            "Ramp theories range from straight ramps to spiraling internal passageways.",
            "The pyramid originally gleamed with polished white limestone casing stones.",
            "A gold capstone once crowned its pointed summit in the desert sun.",
            "Inside, narrow shafts point toward specific stars in the night sky.",
            "The king's chamber contains a sarcophagus carved from a single block of granite.",
            "Robbers emptied its treasures thousands of years ago.",
            "Yet new chambers are still being found with modern scanning technology.",
            "In 2016, scientists discovered a hidden void above the grand gallery.",
            "The builders used copper tools and wooden sledges, nothing more advanced.",
            "Recent finds show the workforce was paid, not enslaved as old stories claimed.",
            "A whole support town with bakeries and granaries fed the pyramid builders.",
            "The pyramid is the only surviving wonder of the ancient world.",
            "Its mystery still attracts scientists and tourists from every continent.",
            "Stay tuned, because the next empire on our journey will shock you!",
        ],
        "visual_keywords": [
            "great pyramid of giza", "pyramid desert sunrise", "pyramid stones closeup", "giza plateau aerial",
            "pyramid night starry sky", "ancient egypt hieroglyphs", "pharaoh golden mask", "king chamber sarcophagus",
            "pyramid narrow passage", "egypt desert camels", "pyramid construction workers", "limestone quarry egypt",
            "ancient sphinx closeup", "nile river aerial", "pyramid moon night", "egyptian temple columns",
            "desert sand dune waves", "pyramid sunset golden", "ancient egyptian boat", "archaeology dig site egypt",
        ],
    },
    {
        "topic": "The Silk Road and the exchange of civilizations",
        "sentences": [
            "Heading east now, imagine a highway of silk stretching across half the world.",
            "The Silk Road was not one road but a web of caravan routes.",
            "It linked China, India, Persia, Arabia, and the Roman Empire for centuries.",
            "Silk was the boom product, worth more per gram than gold in distant Rome.",
            "But paper, gunpowder, and the compass also traveled these same dusty trails.",
            "Merchants crossed scorching deserts, towering mountains, and freezing steppes.",
            "The Taklamakan Desert was called the land where you go in and never come out.",
            "Caravanserais, roadside inns, offered water, food, and rest every thirty miles.",
            "Camels carried up to five hundred pounds across the harshest terrain.",
            "Ideas traveled too, including religions like Buddhism, Christianity, and Islam.",
            "Chinese papermaking reached the West and changed how the world kept records.",
            "Glassware and wool moved east while spices and tea flowed toward Europe.",
            "Diseases also rode the caravans, reshaping whole populations along the way.",
            "The Black Death itself arrived in Europe partly through these trade routes.",
            "Great oasis cities like Samarkand grew wealthy from passing caravan traffic.",
            "Explorers like Marco Polo turned Silk Road journeys into epic stories.",
            "When the Mongol Empire secured the roads, trade reached a golden age.",
            "Ships eventually replaced the overland caravans in the age of exploration.",
            "The Silk Road remains history's greatest example of peaceful exchange.",
            "Next, we meet the conqueror who turned one family into the largest empire ever!",
        ],
        "visual_keywords": [
            "silk road desert caravan", "camel caravan sand dunes", "samarkand blue mosque", "silk fabric weaving loom",
            "old trade route map parchment", "taklamakan desert dunes", "caravanserai stone building", "bactrian camel closeup",
            "chinese silk rolls", "spice market bazaar", "paper making ancient china", "marco polo merchant route",
            "mountain pass himalaya trail", "oasis palm trees desert", "oriental rug weaving", "incense trade caravan",
            "ancient port ship cargo", "gobi desert expedition", "central asia fortress ruins", "silk road sunset camels",
        ],
    },
    {
        "topic": "Genghis Khan and the rise of the Mongol Empire",
        "sentences": [
            "Now meet the ruler whose empire stretched further than any other in history.",
            "Genghis Khan rose from a hunted orphan to master of the steppe.",
            "His real name was Temujin, and his father was poisoned by rivals.",
            "He united the warring tribes of Mongolia through loyalty, not just fear.",
            "His army was organized into decimal units of ten, hundred, and thousand.",
            "Every soldier carried several horses and could ride for days without stopping.",
            "Mongol archers shot accurately from the saddle at full gallop.",
            "Their famous tactic was the feigned retreat, luring enemies into traps.",
            "Engineers captured from China built siege weapons for captured cities.",
            "The empire grew to span from the Pacific Ocean to the gates of Europe.",
            "At its peak it covered one fifth of all the land on Earth.",
            "Genghis Khan encouraged trade and guaranteed safe passage for merchants.",
            "Religious freedom was granted across his realm, a rare idea for the age.",
            "His conquests connected East and West more deeply than ever before.",
            "Allies were rewarded generously while enemies who resisted were destroyed utterly.",
            "The Silk Road flourished under Mongol protection as never before.",
            "After his death, his grandsons divided the empire into four great khanates.",
            "Kublai Khan, his grandson, became emperor of China and founded the Yuan dynasty.",
            "The Mongol legacy reshaped borders, trade, and culture across Asia forever.",
            "One more empire awaits before our journey through history ends!",
        ],
        "visual_keywords": [
            "mongol horseman steppe", "genghis khan statue", "mongolian yurt camp", "horse archer galloping",
            "mongolian warrior armor", "steppe grassland aerial", "mongol army march", "siege tower castle attack",
            "mongolia flag landscape", "pacific ocean coastline", "ancient trade caravan asia", "mongolian eagle hunter",
            "yuan dynasty china palace", "kublai khan painting", "samarkand trade route", "mongolian bow arrows",
            "silk road map asia", "steppe sunset riders", "mongol empire wall art", "war drum mongolia",
        ],
    },
    {
        "topic": "The Maya civilization and its mysterious ancient cities",
        "sentences": [
            "Cross the ocean now, to the jungles of Central America and the Maya.",
            "The Maya built towering pyramids without metal tools or wheeled carts.",
            "Their civilization thrived for more than two thousand years in the rainforest.",
            "Cities like Tikal and Chichen Itza housed tens of thousands of people.",
            "Maya astronomers tracked the planets with stunning mathematical precision.",
            "They invented a writing system of over eight hundred glyph symbols.",
            "The Maya developed the concept of zero long before Europe did.",
            "Their calendar tracked cycles of more than five thousand years.",
            "Chichen Itza's famous pyramid acts as a giant solar calendar.",
            "During equinoxes, shadows form the shape of a serpent moving on the steps.",
            "Water was scarce, so Maya engineers built vast underground reservoirs.",
            "These reservoirs kept entire cities alive through brutal dry seasons.",
            "Powerful kings claimed descent from gods and built temples to prove it.",
            "Scribes painted history on bark books, though only a few survive today.",
            "Conquistadors destroyed thousands of their manuscripts in the sixteenth century.",
            "Classic Maya cities were largely abandoned centuries before the Spanish arrived.",
            "Scientists now think drought and warfare together brought down the great cities.",
            "Yet millions of Maya people still live in the region today.",
            "Their descendants still speak Maya languages and keep ancient traditions alive.",
            "Our final chapter takes us to a walled city whose fall ended an age!",
        ],
        "visual_keywords": [
            "tikal pyramid jungle", "chichen itza temple", "maya ruins aerial", "maya glyph carvings stone",
            "jungle rainforest canopy", "maya calendar stone", "pyramid steps closeup", "maya temple sunset",
            "cenote water cave", "maya astronomy observatory", "ancient ball court ruins", "maya king statue carved",
            "bark paper ancient book", "tropical birds jungle", "maya village traditional", "stone serpent carving",
            "maya masks jade", "solar eclipse ancient sky", "mexico yucatan ruins", "archaeologist maya excavation",
        ],
    },
    {
        "topic": "The Fall of Constantinople in 1453",
        "sentences": [
            "Our journey ends in 1453, at the walls of Constantinople.",
            "This city had guarded the gateway between Europe and Asia for a thousand years.",
            "Its massive walls had repelled every attacking army for over a millennium.",
            "Then the young Ottoman sultan Mehmed the Second arrived with a terrifying plan.",
            "He ordered a giant cannon cast that could smash those ancient walls.",
            "The cannon fired stone balls weighing over half a ton each.",
            "Ottoman engineers also dragged ships overland to enter the golden horn harbor.",
            "Inside, the defenders were vastly outnumbered and running out of hope.",
            "Emperor Constantine the Eleventh refused to abandon his city.",
            "On the final night, the Ottomans breached the walls at a damaged gate.",
            "After fierce street fighting, the city finally fell to the sultan.",
            "The emperor himself died fighting among his soldiers.",
            "Rumors claimed the last emperor was turned to marble by angels.",
            "Constantinople was renamed Istanbul and became the Ottoman capital.",
            "The fall shocked Europe and helped spark the age of exploration.",
            "Scholars fleeing the city carried ancient Greek knowledge to the West.",
            "That knowledge helped ignite the Renaissance across Europe.",
            "The conquest ended the Byzantine Empire after more than eleven hundred years.",
            "Saint Sophia's great dome became a mosque, then a museum for all people.",
            "The walls still stand today, and if you visit, history speaks through them.",
        ],
        "visual_keywords": [
            "constantinople walls fortress", "hagia sophia dome", "ottoman cannon firing", "bosphorus strait ships",
            "istanbul old city walls", "byzantine empire map", "golden horn harbor", "ottoman soldiers uniform",
            "middle age siege battle", "sultan mehmed painting", "ancient cannon balls", "city gate breach stones",
            "byzantine mosaic art", "orthodox church interior", "renaissance books scholars", "early gunpowder war",
            "istanbul skyline sunset", "europe asia bridge aerial", "harbor war galleys", "ancient city wall sunset",
        ],
    },
]

FALLBACK_TITLE = "History's Greatest Secrets: An Epic Journey Through Time (Full Documentary)"
FALLBACK_DESCRIPTION = ("From the arenas of ancient Rome to the fall of Constantinople, this documentary " +
                        "takes you through the greatest eras of world history. Wars, wonders, and the " +
                        "people who changed everything - all in one epic journey. #history #documentary " +
                        "#worldhistory #ancienthistory #ancientcivilizations")
FALLBACK_TAGS = ["history", "documentary", "world history", "ancient history", "ancient civilizations",
                 "roman empire", "egypt", "silk road", "mongol empire", "maya", "byzantine", "full documentary"]


def build_fallback(n):
    """Gemini down ho to history long-form script banata hai (6 eras, ~120 sentences)."""
    sentences, vk = [], []
    for seg in HISTORY_SEGMENTS:
        sentences.extend(seg["sentences"])
        vk.extend(seg["visual_keywords"])
    if n and n > 0:
        sentences = (sentences * (n // len(sentences) + 1))[:n]
        vk = (vk * (n // len(vk) + 1))[:n]
    data = {
        "topic": "The greatest eras of world history",
        "title": FALLBACK_TITLE[:100],
        "description": FALLBACK_DESCRIPTION,
        "tags": FALLBACK_TAGS,
        "sentences": sentences,
        "visual_keywords": vk,
    }
    return data


def load_used_topics():
    if os.path.exists(USED_TOPICS_FILE):
        try:
            return json.load(open(USED_TOPICS_FILE, encoding="utf-8"))
        except Exception:
            return []
    return []


def save_used_topic(topic):
    used = load_used_topics()
    used.append(topic)
    json.dump(used[-200:], open(USED_TOPICS_FILE, "w", encoding="utf-8"), indent=2)


def gemini_call(prompt, attempts=5):
    """Gemini generateContent — 5 attempts, exponential backoff. Fail hone par None."""
    key = CFG["gemini_api_key"]
    if "YAHAN" in key or not key.strip():
        return None
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"response_mime_type": "application/json", "temperature": 0.9}
    }
    last_err = None
    for attempt in range(1, attempts + 1):
        try:
            r = requests.post(GEMINI_URL, params={"key": key}, json=body, timeout=120)
            r.raise_for_status()
            return r.json()["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as e:
            last_err = e
            print(f"    [!] Gemini call {attempt}/{attempts} fail ({GEMINI_MODEL}): {e}", flush=True)
            if attempt < attempts:
                time.sleep(min(30, 2 ** attempt))  # 2s, 4s, 8s, 16s backoff
    print(f"    [!] Gemini {attempts} attempts ke baad bhi fail — last error: {last_err}", flush=True)
    return None


def make_script(topic=None, niche=None, n=None, target_min=None):
    """Gemini se fresh script + title + description + tags mangta hai. Fail hone par history fallback.
    niche=None -> config.json ki niche; niche='...' -> us niche par banao (override).
    n -> sentences count override (channel-specific, e.g. bushcraft 120)
    target_min -> target duration override"""
    used = load_used_topics()
    used_list = ", ".join(used[-25:]) if used else "none"
    if topic:
        topic_line = f'Topic for this video: "{topic}" (isme se deviate mat ho).'
    else:
        topic_line = f'Pick ONE fresh, specific topic inside the niche. Do NOT repeat: {used_list}.'
    lang = CFG["language"]
    niche = (niche or CFG.get("niche", "fascinating history facts from around the world")).strip()
    n = n or CFG.get("sentences_per_video", 120)
    target_min = target_min or (CFG.get("target_duration_minutes") or 10)
    mid1 = max(2, int(n * 0.4))
    mid2 = max(3, int(n * 0.75))

    prompt = f"""You are a YouTube documentary script writer for LONG-FORM videos (10+ minutes) in the niche: "{niche}"
Language for narration: {lang}.
{topic_line}
Write a script for ONE new video with EXACTLY {n} sentences. Documentary narrator style: spoken, punchy, each sentence 8 to 15 words.
Sentence 1 = strong hook to make viewers stay. Around sentence {mid1} and {mid2}, add engagement lines (like \"But the real story is even stranger.\").
Last sentence = clear subscribe call-to-action.
Also give a clickbait but honest title (max 100 chars), a description of 2-4 sentences with 3-5 hashtags, 8-12 tags, and for EACH sentence an English stock-video search keyword (2-5 words).
Return ONLY JSON with keys: "topic", "title", "description", "tags" (array), "sentences" (array), "visual_keywords" (array, same length as sentences)."""

    data = None
    for attempt in range(3):
        raw = gemini_call(prompt)
        if raw:
            try:
                cand = json.loads(raw)
                if cand.get("sentences") and cand.get("visual_keywords"):
                    if len(cand["sentences"]) < max(20, int(n * 0.7)):
                        print(f"    [!] Script chhoti hai ({len(cand['sentences'])}/{n} sentences) — dobara mang raha hoon", flush=True)
                        prompt += f"\nIMPORTANT: Your previous answer had only {len(cand['sentences'])} sentences. You MUST return EXACTLY {n} sentences."
                        continue
                    data = cand
                    break
            except Exception as e:
                print(f"    [!] Gemini JSON parse fail: {e}", flush=True)
    if data:
        if len(data["visual_keywords"]) != len(data["sentences"]):
            data["visual_keywords"] = (data["visual_keywords"] * len(data["sentences"]))[:len(data["sentences"])]
        data["title"] = (CFG["youtube"].get("title_prefix", "") + data.get("title", ""))[:100]
        save_used_topic(data.get("topic", "unknown"))
        return data

    print("[*] Gemini fail — HISTORY long-form fallback use ho raha hai", flush=True)
    data = build_fallback(n)
    save_used_topic(data.get("topic", "unknown"))
    return data


if __name__ == "__main__":
    topic = sys.argv[1] if len(sys.argv) > 1 else None
    s = make_script(topic)
    print(json.dumps(s, indent=2, ensure_ascii=False))