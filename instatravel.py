#!/usr/bin/env python3
"""
insta-travel-map — reconstrói um mapa/painel de viagens a partir do backup do Instagram.

100% local. Nenhum dado sai da sua máquina. Sem LLM, sem nuvem.
Lê o GPS (EXIF) das mídias do export do Instagram, agrupa em cidades,
geocodifica offline, reconstrói voos/viagens, calcula estatísticas e
gera um painel HTML autocontido (mapa de rotas + mapa de calor).

Uso:
    python instatravel.py CAMINHO_DO_EXPORT [opções]

CAMINHO_DO_EXPORT pode ser:
  - a pasta já descompactada do export (contém 'your_instagram_activity/'), ou
  - uma pasta contendo os .zip do export (serão descompactados automaticamente).
"""
import argparse, json, math, os, re, sys, zipfile, glob, webbrowser
from collections import defaultdict, Counter
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")

# ----------------------------- utilidades ---------------------------------
def hav(a, b):
    R = 6371.0
    dlat = math.radians(b[0]-a[0]); dlon = math.radians(b[1]-a[1])
    la1 = math.radians(a[0]); la2 = math.radians(b[0])
    h = math.sin(dlat/2)**2 + math.cos(la1)*math.cos(la2)*math.sin(dlon/2)**2
    return 2*R*math.asin(math.sqrt(h))

def fix_mojibake(s):
    """Instagram grava UTF-8 relido como latin-1 (dupla codificação). Corrige."""
    if not s: return ""
    try: return s.encode("latin-1").decode("utf-8")
    except Exception: return s

def y_of(d): return int(d[:4])

# ------------------------- localizar / extrair ----------------------------
def resolve_root(path):
    if not os.path.exists(path):
        sys.exit(f"Caminho não encontrado: {path}")
    # já descompactado?
    for base, dirs, files in os.walk(path):
        if "your_instagram_activity" in dirs or os.path.isdir(os.path.join(base, "your_instagram_activity")):
            return base
    # tem zips? descompacta
    zips = sorted(glob.glob(os.path.join(path, "*.zip")))
    if zips:
        dest = os.path.join(path, "_insta_extracted")
        os.makedirs(dest, exist_ok=True)
        for z in zips:
            print(f"  descompactando {os.path.basename(z)} …")
            with zipfile.ZipFile(z) as zf:
                zf.extractall(dest)
        for base, dirs, _ in os.walk(dest):
            if "your_instagram_activity" in dirs:
                return base
        return dest
    sys.exit("Não encontrei 'your_instagram_activity/' nem arquivos .zip nesse caminho.")

def detect_handle(root):
    for p in glob.glob(os.path.join(root, "**", "personal_information", "**", "*.json"), recursive=True):
        try:
            d = json.load(open(p, encoding="utf-8"))
        except Exception:
            continue
        blob = json.dumps(d)
        m = re.search(r'"(?:Nome de usu[^"]*|Username)"\s*,\s*"value"\s*:\s*"([^"]+)"', blob)
        if m: return "@"+fix_mojibake(m.group(1))
    return None

# --------------------------- extrair pontos -------------------------------
def gps_from_item(item):
    mm = item.get("media_metadata") or {}
    for k in ("video_metadata", "photo_metadata"):
        for e in (mm.get(k) or {}).get("exif_data") or []:
            la, lo = e.get("latitude"), e.get("longitude")
            if isinstance(la,(int,float)) and isinstance(lo,(int,float)) and (la or lo):
                return la, lo
    return None

def iter_items(data):
    if isinstance(data, dict):
        for k in ("ig_stories", "ig_reels_media", "ig_igtv_media"):
            if k in data:
                yield from data[k]; return
        yield data; return
    if isinstance(data, list):
        yield from data

def extract_points(root):
    files = set()
    for pat in ("your_instagram_activity/media/*.json", "**/your_instagram_activity/media/*.json"):
        files |= set(glob.glob(os.path.join(root, pat), recursive=True))
    rows = []
    def handle(item, ptitle, source):
        g = gps_from_item(item)
        if not g: return
        ts = item.get("creation_timestamp") or 0
        rows.append(dict(lat=g[0], lon=g[1], ts=ts,
                         title=fix_mojibake(item.get("title") or ptitle or ""),
                         source=source))
    for fp in sorted(files):
        try:
            data = json.load(open(fp, encoding="utf-8"))
        except Exception:
            continue
        src = os.path.basename(fp).replace(".json", "")
        for e in iter_items(data):
            if isinstance(e, dict) and isinstance(e.get("media"), list):
                for m in e["media"]: handle(m, e.get("title", ""), src)
            elif isinstance(e, dict):
                handle(e, e.get("title", ""), src)
    # dedupe por (coord, ts)
    seen, ded = set(), []
    for r in rows:
        if not r["ts"]: continue
        k = (round(r["lat"], 5), round(r["lon"], 5), r["ts"])
        if k in seen: continue
        seen.add(k); ded.append(r)
    ded.sort(key=lambda r: r["ts"])
    return ded

# ----------------------------- clusterizar --------------------------------
def cluster(points, thr_km=30.0):
    cell = 0.3
    grid = defaultdict(list)
    for i, r in enumerate(points):
        grid[(int(r["lat"]//cell), int(r["lon"]//cell))].append(i)
    parent = list(range(len(points)))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: parent[rb] = ra
    for (cx, cy), idxs in grid.items():
        neigh = []
        for dx in (-1,0,1):
            for dy in (-1,0,1): neigh += grid.get((cx+dx, cy+dy), [])
        for i in idxs:
            for j in neigh:
                if j <= i: continue
                if hav((points[i]["lat"],points[i]["lon"]),(points[j]["lat"],points[j]["lon"])) <= thr_km:
                    union(i, j)
    cl = defaultdict(list)
    for i, r in enumerate(points): cl[find(i)].append(r)
    out = []
    for items in cl.values():
        lat = sum(x["lat"] for x in items)/len(items)
        lon = sum(x["lon"] for x in items)/len(items)
        ds = sorted(datetime.fromtimestamp(x["ts"], tz=timezone.utc).strftime("%Y-%m-%d") for x in items)
        out.append(dict(lat=lat, lon=lon, n=len(items), first=ds[0], last=ds[-1], items=items))
    out.sort(key=lambda c: -c["n"])
    return out

# --------------------------- geocode offline ------------------------------
def geocode(clusters):
    cc2name = json.load(open(os.path.join(ASSETS, "cc2country.json"), encoding="utf-8"))
    try:
        import reverse_geocoder as rg
    except Exception:
        print("  [aviso] 'reverse_geocoder' não instalado — cidades ficarão sem nome.")
        print("          instale com:  pip install reverse_geocoder")
        for c in clusters:
            c.update(city="", state="", country="", cc="", label=f'({c["lat"]:.2f},{c["lon"]:.2f})')
        return clusters
    res = rg.search([(c["lat"], c["lon"]) for c in clusters], mode=1)
    for c, g in zip(clusters, res):
        cc = (g.get("cc") or "").upper()
        city = g.get("name", ""); state = g.get("admin1", "")
        country = cc2name.get(cc, cc)
        c.update(city=city, state=state, country=country, cc=cc,
                 label=", ".join(x for x in [city, state, country] if x) or f'({c["lat"]:.2f},{c["lon"]:.2f})')
    return clusters

# --------------------------- stats + viagens ------------------------------
def build_everything(points, places, M, args):
    def snap(lat, lon):
        best, bd = None, 1e9
        for pl in places:
            d = hav((lat,lon),(pl["lat"],pl["lon"]))
            if d < bd: bd, best = d, pl
        if best and bd <= 60: return best["label"], best["lat"], best["lon"], best.get("country","")
        return f'({lat:.2f},{lon:.2f})', lat, lon, ""
    for p in points:
        p["label"], p["plat"], p["plon"], p["country"] = snap(p["lat"], p["lon"])
        p["day"] = datetime.fromtimestamp(p["ts"], tz=timezone.utc).strftime("%Y-%m-%d")

    # daily dominant -> stays
    byday = defaultdict(list)
    for p in points: byday[p["day"]].append(p)
    daily = []
    for day in sorted(byday):
        lab = Counter(x["label"] for x in byday[day]).most_common(1)[0][0]
        rep = next(x for x in byday[day] if x["label"] == lab)
        daily.append(dict(day=day, label=lab, lat=rep["plat"], lon=rep["plon"], country=rep["country"]))
    stays = []
    for d in daily:
        if stays and stays[-1]["label"] == d["label"]: stays[-1]["end"] = d["day"]
        else: stays.append(dict(**d, start=d["day"], end=d["day"]))

    home = max(places, key=lambda x: x["n"])
    HOME = {home["label"]}
    home_country = home.get("country", "")
    def dd(a, b): return (datetime.strptime(b,"%Y-%m-%d")-datetime.strptime(a,"%Y-%m-%d")).days

    FK = 300  # km mínimo p/ considerar "voo"
    legs = []; flight_km = 0.0; flights = 0
    for i in range(len(stays)-1):
        a, b = stays[i], stays[i+1]
        d = hav((a["lat"],a["lon"]),(b["lat"],b["lon"]))
        if d < 1: continue
        f = d >= FK
        legs.append(dict(km=d, flight=f, ts=b["start"], a=[a["lat"],a["lon"]], b=[b["lat"],b["lon"]],
                         a_ctry=a["country"], b_ctry=b["country"]))
        if f: flight_km += d; flights += 1
    fl = [l for l in legs if l["flight"]]

    # ------- manual entries -------
    man_legs = []
    for m in M:
        o = m["origin"]; d = hav((o[0],o[1]),(m["lat"],m["lon"])); reps = 2 if m.get("roundtrip") else 1
        man_legs.append(dict(km=d, ts=m["first"], a=o, b=[m["lat"],m["lon"]], reps=reps,
                             a_ctry=home_country, b_ctry=m.get("country","")))

    # ------- yearly buckets (GPS + manual) -------
    yfl, ykm = defaultdict(int), defaultdict(float)
    for l in fl: yfl[y_of(l["ts"])] += 1; ykm[y_of(l["ts"])] += l["km"]
    for l in man_legs: yfl[y_of(l["ts"])] += l["reps"]; ykm[y_of(l["ts"])] += l["km"]*l["reps"]

    # ------- cost model (doméstico = país de origem) -------
    RD, RIE, RIX = args.rate_dom, args.rate_intl, args.rate_intl_exec
    def is_dom(a_ctry, b_ctry): return a_ctry and a_ctry == home_country and b_ctry == home_country
    all_cost_legs = [(l["km"], is_dom(l["a_ctry"], l["b_ctry"]), 1) for l in fl] + \
                    [(l["km"], is_dom(l["a_ctry"], l["b_ctry"]), l["reps"]) for l in man_legs]
    dom_km = sum(k*r for k, dmo, r in all_cost_legs if dmo)
    intl_list = sorted([(k, r) for k, dmo, r in all_cost_legs if not dmo], key=lambda x: -x[0])
    intl_km = sum(k*r for k, r in intl_list)
    cost_base = dom_km*RD + intl_km*RIE
    # prêmio executiva nas N pernas internacionais mais longas
    prem, left = 0.0, args.exec_legs
    for k, r in intl_list:
        take = min(r, left)
        if take <= 0: break
        prem += (RIX-RIE)*k*take; left -= take
    cost_total = cost_base + prem
    total_km_cost = dom_km + intl_km
    cost_rate = cost_total/max(1, total_km_cost)

    # ------- universo de lugares p/ contagem cumulativa -------
    allplaces = [{"country":p.get("country",""), "city":p.get("city",""), "first":p["first"]} for p in places]
    for m in M: allplaces.append({"country":m.get("country",""), "city":m.get("city",""), "first":m["first"]})
    ymin = min(y_of(a["first"]) for a in allplaces)
    ymax = max([y_of(a["first"]) for a in allplaces] + [y_of(l["ts"]) for l in man_legs] or [ymin])

    cum = {}
    for Y in range(ymin, ymax+1):
        ap = [a for a in allplaces if y_of(a["first"]) <= Y]
        kmv = sum(ykm[y] for y in ykm if y <= Y)
        fv = sum(yfl[y] for y in yfl if y <= Y)
        cum[Y] = [len(set(a["country"] for a in ap if a["country"])),
                  len(set((a["city"],a["country"]) for a in ap if a["city"])),
                  len(ap), fv, round(kmv), round(kmv/800+0.5*fv), round(kmv*cost_rate)]

    # ------- trips (GPS, delimitadas por casa/gap) -------
    trips = []
    def close(run):
        if not run: return
        route = []
        for s in run:
            nm = s["label"].split(",")[0]
            if not route or route[-1] != nm: route.append(nm)
        km = hav((home["lat"],home["lon"]),(run[0]["lat"],run[0]["lon"]))
        for i in range(len(run)-1): km += hav((run[i]["lat"],run[i]["lon"]),(run[i+1]["lat"],run[i+1]["lon"]))
        km += hav((run[-1]["lat"],run[-1]["lon"]),(home["lat"],home["lon"]))
        lats = [s["lat"] for s in run]; lons = [s["lon"] for s in run]
        trips.append(dict(start=run[0]["start"], end=run[-1]["end"], days=dd(run[0]["start"],run[-1]["end"])+1,
                          route=route, countries=sorted(set(s["country"] for s in run if s["country"])),
                          km=round(km), b=[min(lats),min(lons),max(lats),max(lons)]))
    cur = []
    for s in stays:
        if s["label"] in HOME: close(cur); cur = []
        else:
            if cur and dd(cur[-1]["end"], s["start"]) > args.trip_gap: close(cur); cur = []
            cur.append(s)
    close(cur)
    # manual trips (agrupa por tempo+espaço)
    for m in sorted(M, key=lambda x: x["first"]):
        placed = False
        for t in trips:
            if t.get("_man") and abs(dd(t["start"], m["first"])) <= 60 and hav((t["_c"][0],t["_c"][1]),(m["lat"],m["lon"])) <= 4000:
                t["route"].append(m.get("city") or m["label"].split(",")[0])
                t["countries"] = sorted(set(t["countries"]+[m.get("country","")]))
                t["km"] += round(hav((m["origin"][0],m["origin"][1]),(m["lat"],m["lon"]))*(2 if m.get("roundtrip") else 1))
                placed = True; break
        if not placed:
            trips.append(dict(start=m["first"], end=m["last"], days=None,
                route=[m.get("city") or m["label"].split(",")[0]], countries=[m.get("country","")],
                km=round(hav((m["origin"][0],m["origin"][1]),(m["lat"],m["lon"]))*(2 if m.get("roundtrip") else 1)),
                b=[m["lat"]-.5,m["lon"]-.5,m["lat"]+.5,m["lon"]+.5], _man=True, _c=[m["lat"],m["lon"]]))
    for t in trips: t.pop("_man", None); t.pop("_c", None)
    trips.sort(key=lambda t: t["start"], reverse=True)

    # ------- year rows / country stats / places -------
    year_rows = [{"y":y, "places":len(set(s["label"] for s in stays if y_of(s["start"])==y)),
                  "countries":len(set(s["country"] for s in stays if y_of(s["start"])==y and s["country"])),
                  "flights":yfl[y], "flight_km":round(ykm[y])} for y in range(ymin, ymax+1)]
    farthest = max(points, key=lambda p: hav((home["lat"],home["lon"]),(p["lat"],p["lon"])))
    far_km = hav((home["lat"],home["lon"]),(farthest["lat"],farthest["lon"]))
    c = cum[ymax]
    summary = dict(home=home["label"], farthest=farthest.get("label",""), far_km=round(far_km),
                   first=(daily[0]["day"] if daily else ""), last="", hours_low=round(sum(l["km"]/850+0.3 for l in fl)+sum(l["km"]/850*l["reps"]+0.3*l["reps"] for l in man_legs)),
                   hours_high=round(sum(l["km"]/750+0.75 for l in fl)+sum(l["km"]/750*l["reps"]+0.75*l["reps"] for l in man_legs)),
                   days_mid=round(c[5]/24,1), earth_laps=round(c[4]/40075,1), total_km=c[4])

    bycc = defaultdict(lambda: {"n":0,"pl":0,"first":"9999","last":"0"})
    for pl in places:
        b = bycc[pl.get("country","?") or "?"]; b["n"] += pl["n"]; b["pl"] += 1
        b["first"] = min(b["first"], pl["first"]); b["last"] = max(b["last"], pl["last"])
    for m in M:
        b = bycc[m.get("country","?") or "?"]; b["n"] += 1; b["pl"] += 1
        b["first"] = min(b["first"], m["first"]); b["last"] = max(b["last"], m["last"])
    places_full = sorted(places, key=lambda x: -x["n"]) + \
        [{"label":m["label"],"city":m.get("city",""),"country":m.get("country",""),"n":1,"first":m["first"],"last":m["last"],"lat":m["lat"],"lon":m["lon"]} for m in M]
    places_disp = list(places) + [{"label":m["label"],"lat":m["lat"],"lon":m["lon"],"n":1,"first":m["first"],"last":m["last"]} for m in M]

    # records
    def near_label(c2):
        best, bd = None, 1e9
        for pl in places+[{"label":m["label"],"lat":m["lat"],"lon":m["lon"]} for m in M]:
            d = hav((c2[0],c2[1]),(pl["lat"],pl["lon"]))
            if d < bd: bd, best = d, pl
        return best["label"].split(",")[0] if best else "?"
    alllegs = [(round(l["km"]),l["a"],l["b"]) for l in fl] + [(round(l["km"]),l["a"],l["b"]) for l in man_legs]
    lf = max(alllegs, key=lambda x: x[0]) if alllegs else (0,[0,0],[0,0])
    busy = max(year_rows, key=lambda r: r["flight_km"]) if year_rows else {"y":"-","flight_km":0,"flights":0}
    topcity = max(places, key=lambda p: p["n"]) if places else {"city":"","label":"","n":0}
    longest = max([t for t in trips if t["days"]], key=lambda t: t["days"], default=None)
    records = [
        ["Voo mais longo", f'{near_label(lf[1])} → {near_label(lf[2])} · {lf[0]:,} km'.replace(",",".")],
        ["Cidade mais visitada", f'{topcity.get("city") or topcity.get("label","").split(",")[0]} · {topcity["n"]} mídias'],
        ["Ano mais intenso", f'{busy["y"]} · {round(busy["flight_km"]/1000)} mil km · {busy["flights"]} voos'],
        ["Ponto mais distante", f'{summary["farthest"].split(",")[0]} · {summary["far_km"]:,} km'.replace(",",".")],
        ["Viagem mais longa", (f'{longest["days"]} dias · {"/".join(longest["route"][:3])} · {longest["start"][:7]}' if longest else "—")],
        ["Total de viagens", f'{len(trips)} jornadas reconstruídas'],
    ]

    DATA = dict(points=[], places=places_disp, legs=[], year=year_rows, ymin=ymin, ymax=ymax,
                cum=cum, trips=trips, records=records, summary=summary, currency=args.currency,
                country_stats=sorted([{"name":k, **v} for k,v in bycc.items()], key=lambda x:-x["n"]),
                places_full=places_full)
    # pontos e rotas p/ o mapa
    for p in points:
        t = (p["title"] or "").replace("\n"," ").strip()
        DATA["points"].append([round(p["lat"],4), round(p["lon"],4), y_of(p["day"]), p["source"][:2], (t[:127]+"…") if len(t)>130 else t])
    for m in M: DATA["points"].append([m["lat"], m["lon"], y_of(m["first"]), "", m.get("city","")])
    legc = defaultdict(int)
    for l in fl: legc[(round(l["a"][0],2),round(l["a"][1],2),round(l["b"][0],2),round(l["b"][1],2))] += 1
    DATA["legs"] = [{"a":[k[0],k[1]],"b":[k[2],k[3]]} for k in legc] + [{"a":l["a"],"b":l["b"]} for l in man_legs]
    return DATA, cost_total

# ------------------------------- render -----------------------------------
def render(DATA, handle, out_path):
    tpl = open(os.path.join(ASSETS, "template.html"), encoding="utf-8").read()
    heat = open(os.path.join(ASSETS, "leaflet-heat.js"), encoding="utf-8").read()
    first = DATA["summary"]["first"] or f'{DATA["ymin"]}'
    last = DATA["cum"] and f'{DATA["ymax"]}' or ""
    last = max((p[2] for p in DATA["points"]), default=DATA["ymax"])
    html = (tpl.replace("__HEATJS__", heat)
               .replace("__DATA__", json.dumps(DATA, ensure_ascii=False))
               .replace("__YMIN__", str(DATA["ymin"])).replace("__YMAX__", str(DATA["ymax"]))
               .replace("__HANDLE__", handle)
               .replace("__FIRST__", first).replace("__LAST__", str(last)))
    open(out_path, "w", encoding="utf-8").write(html)

# -------------------------------- main ------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Mapa/painel de viagens a partir do backup do Instagram (100% local).")
    ap.add_argument("export", help="pasta do export do Instagram (descompactada ou com os .zip)")
    ap.add_argument("-o","--out", default="mapa_viagens.html", help="arquivo HTML de saída")
    ap.add_argument("--handle", default=None, help="rótulo do topo (ex.: @seuusuario). Auto-detecta se omitido.")
    ap.add_argument("--manual", default=None, help="caminho de manual_entries.json (viagens sem GPS)")
    ap.add_argument("--suggest", action="store_true", help="varrer legendas e sugerir viagens sem GPS (grava suggestions.json)")
    ap.add_argument("--currency", default="R$", help="símbolo da moeda no custo (padrão R$)")
    ap.add_argument("--rate-dom", type=float, default=0.65, help="tarifa doméstica R$/km (econômica)")
    ap.add_argument("--rate-intl", type=float, default=0.42, help="tarifa internacional R$/km (econômica)")
    ap.add_argument("--rate-intl-exec", type=float, default=1.40, help="tarifa internacional R$/km (executiva)")
    ap.add_argument("--exec-legs", type=int, default=0, help="nº de pernas internacionais na executiva (0 = tudo econômica)")
    ap.add_argument("--trip-gap", type=int, default=21, help="dias de intervalo que separam uma viagem da outra")
    ap.add_argument("--no-open", action="store_true", help="não abrir o navegador ao final")
    args = ap.parse_args()

    print("• localizando export…")
    root = resolve_root(args.export)
    handle = args.handle or detect_handle(root) or "MEU MAPA"
    print(f"  raiz: {root}\n  perfil: {handle}")

    print("• extraindo pontos com GPS…")
    points = extract_points(root)
    if not points:
        sys.exit("Nenhuma mídia com GPS encontrada. (O Instagram só grava EXIF em parte das mídias.)")
    print(f"  {len(points)} mídias geotagueadas ({points[0]['ts'] and datetime.fromtimestamp(points[0]['ts'],tz=timezone.utc).year}–"
          f"{datetime.fromtimestamp(points[-1]['ts'],tz=timezone.utc).year})")

    print("• agrupando em cidades…")
    places = cluster(points)
    print(f"  {len(places)} lugares")
    print("• geocodificando (offline)…")
    places = geocode(places)

    # manual entries
    M = []
    mpath = args.manual or os.path.join(os.path.dirname(os.path.abspath(args.out)) or ".", "manual_entries.json")
    if os.path.exists(mpath):
        try:
            M = json.load(open(mpath, encoding="utf-8")).get("entries", [])
            print(f"• {len(M)} entradas manuais carregadas de {mpath}")
        except Exception as e:
            print(f"  [aviso] manual_entries.json inválido: {e}")

    if args.suggest:
        try:
            from gazetteer import scan_captions
            known = set(p.get("country","") for p in places) | set(m.get("country","") for m in M)
            sug = scan_captions(root, known)
            json.dump(sug, open("suggestions.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)
            print(f"• {len(sug)} destinos candidatos (sem GPS) gravados em suggestions.json")
        except Exception as e:
            print(f"  [aviso] varredura de legendas falhou: {e}")

    print("• calculando estatísticas e viagens…")
    DATA, cost_total = build_everything(points, places, M, args)

    print("• renderizando painel…")
    render(DATA, handle, args.out)
    c = DATA["cum"][DATA["ymax"]]
    print(f"\n✓ {args.out}")
    print(f"  {c[0]} países · {c[1]} cidades · {c[3]} voos · {c[5]} h de voo · {c[4]:,} km".replace(",","."))
    print(f"  custo estimado ≈ {args.currency} {round(cost_total):,}".replace(",","."))
    if not args.no_open:
        webbrowser.open("file://"+os.path.abspath(args.out))

if __name__ == "__main__":
    main()
