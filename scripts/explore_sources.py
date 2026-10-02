import io, re, json, requests, openpyxl
from bs4 import BeautifulSoup
H = {"User-Agent": "Mozilla/5.0 (lamal-tracker explore)"}
def get(u, **k):
    r = requests.get(u, headers=H, timeout=60, **k); print("GET", u, r.status_code, len(r.content)); return r
def links(u, pat=None):
    try:
        r = get(u); s = BeautifulSoup(r.text, "html.parser")
        out = []
        for a in s.find_all("a", href=True):
            h = requests.compat.urljoin(u, a["href"]); t = " ".join(a.get_text().split())
            if pat is None or re.search(pat, h + " " + t, re.I): out.append((h, t))
        for h, t in out: print("  LINK", h, "|", t[:120])
        return out, s
    except Exception as e:
        print("ERR", u, e); return [], None
def text_lines(u, pat):
    try:
        r = get(u); s = BeautifulSoup(r.text, "html.parser")
        for line in s.get_text("\n").split("\n"):
            l = " ".join(line.split())
            if l and re.search(pat, l, re.I): print("  TXT", l[:400])
    except Exception as e: print("ERR", u, e)
def dump_xlsx(u, maxrows=400):
    try:
        r = get(u); wb = openpyxl.load_workbook(io.BytesIO(r.content), read_only=True, data_only=True)
        for ws in wb.worksheets:
            print("== SHEET", ws.title)
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i >= maxrows: break
                print("  ROW", i, json.dumps([c for c in row], ensure_ascii=False, default=str))
    except Exception as e: print("ERR", u, e)

print("\n##### 1. BAG insurer directory")
ls, _ = links("https://www.bag.admin.ch/de/verzeichnisse-der-zugelassenen-kranken-und-rueckversicherer", r"xlsx|pdf|verzeichnis|zugelassen")
for h, t in ls:
    if h.lower().endswith(".xlsx") or "xlsx" in t.lower():
        dump_xlsx(h); break
for h, t in ls:
    if "rück" in (h+t).lower(): continue

print("\n##### 2. CO2")
for u in ["https://www.bafu.admin.ch/de/co2-abgabe-verteilung", "https://www.bafu.admin.ch/de/co2-abgabe-private",
          "https://www.bafu.admin.ch/fr/taxe-co2-redistribution", "https://www.bafu.admin.ch/bafu/de/home/themen/klima/fachinformationen/klimapolitik/co2-abgabe/rueckverteilung-der-co2-abgabe.html"]:
    text_lines(u, r"(Franken|CHF|Fr\.)\s*\d|\d+[.,]\d{2}\s*(Franken|CHF)|pro Person|par personne")
    links(u, r"rückverteil|redistribu|medienmitteil|communiqu")

print("\n##### 3. opendata.swiss")
for q in ["Aufsichtsdaten", "Kennzahlen Krankenversicherer", "Krankenversicherer", "Zusatzversicherung", "assureurs-maladie", "Versicherer Adressen"]:
    try:
        r = get("https://opendata.swiss/api/3/action/package_search", params={"q": q, "rows": 20})
        for p in r.json()["result"]["results"]:
            print("  PKG", p["name"], "|", (p.get("title") or {}).get("de"), "|", (p.get("organization") or {}).get("name"))
            for res in p.get("resources", [])[:12]:
                print("     RES", res.get("format"), res.get("url") or res.get("download_url"), "|", (res.get("title") or {}).get("de"))
    except Exception as e: print("ERR", q, e)

print("\n##### 4. priminfo")
links("https://www.priminfo.admin.ch/de/zahlen-und-fakten/kennzahlen", r"csv|xlsx|opendata|json|download")
links("https://www.bag.admin.ch/de/aufsichtsdaten-krankenversicherer", r"csv|xlsx|opendata|download|kennzahl")
links("https://dashboardkrankenversicherung.admin.ch/uebersicht.html", r"csv|xlsx|json|opendata")
