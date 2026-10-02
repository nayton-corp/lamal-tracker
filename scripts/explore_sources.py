import io, re, json, base64, requests, openpyxl, pdfplumber
from bs4 import BeautifulSoup
H = {"User-Agent": "Mozilla/5.0 (lamal-tracker explore)"}
def get(u, **k):
    r = requests.get(u, headers=H, timeout=90, **k); print("GET", u, r.status_code, len(r.content)); return r
def pdf_text(u):
    r = get(u)
    with pdfplumber.open(io.BytesIO(r.content)) as pdf:
        for i, p in enumerate(pdf.pages):
            print(f"--- page {i}")
            for l in (p.extract_text() or "").split("\n"): print("  PDF", l)
print("##### CO2 history")
pdf_text("https://www.bafu.admin.ch/dam/de/sd-web/X1vJfsmQOgqo/Historique%20redistribution_D_2026.pdf")
print("##### CO2 2027")
pdf_text("https://www.bafu.admin.ch/dam/de/sd-web/XbymcrjADsM0/Merkblatt%20R%C3%BCckverteilung%20CO2-%20und%20VOC-Abgaben%202027.pdf")
print("##### CO2 page html around amounts")
r = get("https://www.bafu.admin.ch/de/co2-abgabe-private")
for m in re.finditer(r"CHF\s*\d+\.\d{2}", r.text):
    print("  CTX", re.sub(r"\s+", " ", r.text[max(0, m.start()-300): m.end()+100]))
print("##### Insurer xlsx base64")
r = get("https://www.bag.admin.ch/dam/de/sd-web/pigYvqGTcJOi/Zugelassene%20Krankenversicherer_1.10.2026.xlsx")
b = base64.b64encode(r.content).decode()
for i in range(0, len(b), 4000): print("B64", b[i:i+4000])
print("##### Aufsichtsdaten")
r = get("https://www.bag.admin.ch/dam/de/sd-web/RRUZlsq0gPk7/aufsichtsdaten-okp-1996-2024.xlsx")
wb = openpyxl.load_workbook(io.BytesIO(r.content), read_only=True, data_only=True)
for ws in wb.worksheets:
    print("== SHEET", ws.title, ws.max_row, ws.max_column)
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i >= 12: break
        print("  ROW", i, json.dumps(list(row)[:40], ensure_ascii=False, default=str)[:1500])
print("##### Musterbriefe")
r = get("https://www.priminfo.admin.ch/fr/downloads/musterbriefe")
s = BeautifulSoup(r.text, "html.parser")
for a in s.find_all("a", href=True):
    h = requests.compat.urljoin(r.url, a["href"])
    if re.search(r"pdf|docx|lettre|brief", h, re.I): print("  LINK", h, "|", " ".join(a.get_text().split()))
