"""
Varredura heurística de legendas (sem LLM) para sugerir viagens SEM GPS.
Menção a um país != viagem — por isso exige contexto de deslocamento e
devolve candidatos para revisão humana, nunca adiciona automaticamente.
"""
import json, os, re, glob
from datetime import datetime, timezone
from collections import defaultdict

def _fix(s):
    try: return s.encode("latin-1").decode("utf-8")
    except Exception: return s

def _iter(data):
    if isinstance(data, dict):
        for k in ("ig_stories","ig_reels_media","ig_igtv_media"):
            if k in data: yield from data[k]; return
        yield data; return
    if isinstance(data, list): yield from data

# país -> regex (cidades/gentílicos/bandeira). Amplie à vontade.
GAZ = {
 "Coreia do Sul": r"cor[eé]ia do sul|korea|seul|seoul|🇰🇷|incheon|busan",
 "Japão": r"jap[aã]o|japan|t[oó]quio|tokyo|osaka|kyoto|🇯🇵",
 "Taiwan": r"taiwan|taip[eé]|🇹🇼", "Macau": r"\bmacau\b|🇲🇴",
 "China": r"\bchina\b|hong ?kong|shenzhen|guangzhou|cant[aã]o|xi'?an|nanning|pequim|beijing|xangai|shanghai|🇨🇳",
 "Índia": r"[ií]ndia\b|mumbai|nova delhi|new delhi|bangalore|🇮🇳",
 "Reino Unido": r"londres|london|reino unido|🇬🇧|heathrow",
 "Portugal": r"\bportugal\b|lisboa|🇵🇹", "Espanha": r"espanha|madri|madrid|barcelona|🇪🇸",
 "França": r"fran[çc]a|paris|🇫🇷", "Itália": r"it[aá]lia|roma\b|mil[aã]o|veneza|🇮🇹",
 "Alemanha": r"alemanha|berlim|munique|frankfurt|🇩🇪", "Suíça": r"su[ií][çc]a|zurique|genebra|🇨🇭",
 "Áustria": r"[aá]ustria|viena|🇦🇹", "Países Baixos": r"holanda|amsterd|🇳🇱",
 "Rússia": r"r[uú]ssia|moscou|petersburgo|🇷🇺", "Turquia": r"turquia|istambul|🇹🇷",
 "Emirados Árabes Unidos": r"emirados|dubai|abu dhabi|🇦🇪", "Catar": r"catar|qatar|doha|🇶🇦",
 "Arábia Saudita": r"ar[aá]bia saudita|riad|riyadh|jeddah|🇸🇦", "Egito": r"egito|cairo|🇪🇬",
 "África do Sul": r"[aá]frica do sul|south africa|joanesburgo|johannesburg|🇿🇦",
 "Estados Unidos": r"\beua\b|estados unidos|nova york|new york|miami|los angeles|texas|houston|vegas|🇺🇸",
 "Canadá": r"canad[aá]|toronto|vancouver|montreal|🇨🇦", "México": r"m[eé]xico|cancun|🇲🇽",
 "Colômbia": r"col[oô]mbia|bogot[aá]|cartagena|medell[ií]n|🇨🇴", "Peru": r"\bperu\b|lima\b|cusco|🇵🇪",
 "Chile": r"\bchile\b|santiago|atacama|🇨🇱", "Argentina": r"argentina|buenos aires|🇦🇷",
 "Paraguai": r"paraguai|assun[çc][aã]o|🇵🇾", "Equador": r"equador|quito|gal[aá]pagos|🇪🇨",
 "Sudão": r"sud[aã]o|cartum|khartoum|🇸🇩", "Singapura": r"singapura|singapore|🇸🇬",
 "Tailândia": r"tail[aâ]ndia|bangkok|🇹🇭", "Austrália": r"austr[aá]lia|sydney|🇦🇺",
}
CTX = re.compile(r"cheguei|chegando|estou em|aqui em|visita|visitando|rumo a|indo para|de volta a|"
                 r"aeroporto|voo para|voando|embarqu|conex[aã]o|next ?stop|pr[oó]ximo destino|"
                 r"[a-z]{3,}\s*[>→]\s*[a-z]{3,}|miss[aã]o|roadshow|feira|na cidade de", re.I)

def scan_captions(root, known_countries):
    files = set()
    for pat in ("your_instagram_activity/media/*.json", "**/your_instagram_activity/media/*.json"):
        files |= set(glob.glob(os.path.join(root, pat), recursive=True))
    caps = []
    for fp in sorted(files):
        try: data = json.load(open(fp, encoding="utf-8"))
        except Exception: continue
        src = os.path.basename(fp).replace(".json","")
        for e in _iter(data):
            media = e.get("media") if isinstance(e,dict) and isinstance(e.get("media"),list) else [e]
            pt = _fix(e.get("title","")) if isinstance(e,dict) else ""
            for m in media:
                if not isinstance(m,dict): continue
                t = _fix(m.get("title") or pt or "")
                ts = m.get("creation_timestamp") or (e.get("creation_timestamp") if isinstance(e,dict) else 0)
                if t and ts: caps.append((ts, src, t.replace("\n"," ")))
    caps.sort()
    hits = defaultdict(list)
    for ts, src, t in caps:
        if not CTX.search(t): continue
        d = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        for country, pat in GAZ.items():
            if country in known_countries: continue
            if re.search(pat, t, re.I): hits[country].append((d, t[:120]))
    out = []
    for country, hs in sorted(hits.items(), key=lambda x:-len(x[1])):
        ds = [h[0] for h in hs]
        out.append(dict(country=country, mentions=len(hs), first=min(ds), last=max(ds),
                        samples=[{"date":d,"caption":c} for d,c in hs[:5]]))
    return out
