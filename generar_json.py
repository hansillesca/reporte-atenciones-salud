
from pathlib import Path
import pandas as pd
import json, re, unicodedata, sys
from datetime import datetime

EXCEL_DIR = Path(r"D:\BASE DE DATOS")
OUT_DIR = Path(__file__).resolve().parent / "data"
OUT_DIR.mkdir(exist_ok=True)

# Objetivo: que cada JSON quede suficientemente pequeño para subir por web a GitHub.
MAX_BYTES = 8 * 1024 * 1024  # 8 MB aprox.

def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode()
    return re.sub(r"\s+"," ",s.strip()).lower()

ALIASES = {
 "fecha": ["fecha atencion","fecha de atencion","fecha_atencion"],
 "eess": ["eess","establecimiento","establecimiento de salud"],
 "prof": ["profesional","personal de salud","nombre profesional"],
 "tipo_prof": ["tipo profesional","profesion","tipo_profesional"],
 "servicio": ["servicio","prestacion","prestación"],
 "fua": ["estado fua","estado_fua","estado"],
 "sexo": ["sexo"],
 "edad": ["grupo etario","grupo_etario","etapa de vida"],
 "lugar": ["lugar atencion","lugar de atencion","lugar_atencion"],
 "tipo_at": ["tipo atencion","tipo de atencion","tipo_atencion"],
 "fua_id": ["fua","numero fua","nro fua","n° fua"]
}

def find_col(cols, aliases):
    m={norm(c):c for c in cols}
    for a in aliases:
        if norm(a) in m: return m[norm(a)]
    for c0,c in m.items():
        if any(norm(a) in c0 for a in aliases): return c
    return None

def anonymize(name):
    if pd.isna(name): return "SIN PROFESIONAL"
    s=str(name).strip()
    if not s: return "SIN PROFESIONAL"
    parts=re.split(r"\s{2,}",s)
    if len(parts)>=2:
        given=parts[0].split()
        surn=" ".join(parts[1:]).strip()
    else:
        toks=s.split()
        if len(toks)>=4:
            given=toks[:-2]; surn=" ".join(toks[-2:])
        elif len(toks)==3:
            given=toks[:1]; surn=" ".join(toks[1:])
        else:
            given=toks[:1]; surn=" ".join(toks[1:])
    initials=" ".join((x[0].upper()+".") for x in given if x)
    return (initials+" "+surn.upper()).strip()

def clean(v, default="SIN DATO"):
    if pd.isna(v) or str(v).strip()=="": return default
    return re.sub(r"\s+"," ",str(v).strip()).upper()

# Limpia chunks anteriores
for old in OUT_DIR.glob("chunk_*.json"):
    old.unlink()
for old in OUT_DIR.glob("20??-??.json"):
    old.unlink()
for old in [OUT_DIR/"facts.json"]:
    if old.exists():
        old.unlink()

files=[p for p in EXCEL_DIR.rglob("*.xlsx") if not p.name.startswith("~$")]
if not files:
    print(f"No se encontraron Excel en {EXCEL_DIR}")
    input("Presiona ENTER para salir...")
    sys.exit(1)

frames=[]; warnings=[]
for p in files:
    try:
        df=pd.read_excel(p)
        cols={k:find_col(df.columns,v) for k,v in ALIASES.items()}
        if not cols["fecha"] or not cols["eess"] or not cols["prof"]:
            warnings.append(f"{p.name}: faltan columnas clave")
            continue

        out=pd.DataFrame()
        out["date"]=pd.to_datetime(df[cols["fecha"]],errors="coerce",dayfirst=True)
        out["eess"]=df[cols["eess"]].map(clean)
        out["prof"]=df[cols["prof"]].map(anonymize)

        for k in ["tipo_prof","servicio","fua","sexo","edad","lugar","tipo_at"]:
            out[k]=df[cols[k]].map(clean) if cols[k] else "SIN DATO"

        out["_fua_id"]=df[cols["fua_id"]].astype(str).str.strip() if cols["fua_id"] else ""
        frames.append(out)
        print("OK",p.name,len(out))
    except Exception as e:
        warnings.append(f"{p.name}: {e}")

if not frames:
    print("Ningun archivo pudo ser procesado.")
    input("ENTER para salir...")
    sys.exit(1)

df=pd.concat(frames,ignore_index=True)
df=df[df["date"].notna()].copy()

mask=df["_fua_id"].notna() & (df["_fua_id"].astype(str).str.strip()!="") & (df["_fua_id"].astype(str)!="nan")
df=pd.concat([
    df[mask].drop_duplicates(subset=["_fua_id"],keep="last"),
    df[~mask]
],ignore_index=True)

df["year"]=df["date"].dt.strftime("%Y")
df["month"]=df["date"].dt.strftime("%m")
df["period"]=df["date"].dt.strftime("%Y-%m")
df["date"]=df["date"].dt.strftime("%Y-%m-%d")

dims=["date","year","month","period","eess","prof","tipo_prof","servicio","fua","sexo","edad","lugar","tipo_at"]
facts=df.groupby(dims,dropna=False).size().reset_index(name="n")
records=facts.to_dict(orient="records")

# Partición por tamaño real serializado
chunks=[]
current=[]
current_size=2  # []
chunk_no=1

def write_chunk(rows, no):
    fn=f"chunk_{no:03d}.json"
    payload=json.dumps(rows,ensure_ascii=False,separators=(",",":"))
    path=OUT_DIR/fn
    path.write_text(payload,encoding="utf-8")
    size=path.stat().st_size
    print(f"GENERADO {fn}: {len(rows):,} filas / {size/1024/1024:.2f} MB")
    return {"file":fn,"rows":len(rows),"bytes":size}

for r in records:
    item=json.dumps(r,ensure_ascii=False,separators=(",",":")).encode("utf-8")
    extra=len(item)+(1 if current else 0)
    if current and current_size+extra > MAX_BYTES:
        chunks.append(write_chunk(current,chunk_no))
        chunk_no += 1
        current=[]
        current_size=2
    current.append(r)
    current_size += extra

if current:
    chunks.append(write_chunk(current,chunk_no))

index={
    "chunks": chunks,
    "periods": sorted(facts["period"].dropna().astype(str).unique().tolist()),
    "updated_at": datetime.now().strftime("%d/%m/%Y %I:%M %p")
}
(OUT_DIR/"index.json").write_text(json.dumps(index,ensure_ascii=False,indent=2),encoding="utf-8")

metadata={
 "updated_at": index["updated_at"],
 "files": len(files),
 "files_ok": len(frames),
 "records_after_dedup": int(len(df)),
 "aggregated_rows": int(len(facts)),
 "chunk_count": len(chunks),
 "warnings": warnings
}
(OUT_DIR/"metadata.json").write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding="utf-8")

print("\n==============================================")
print("JSON DIVIDIDOS EN BLOQUES PEQUENOS")
print("==============================================")
print("Excel encontrados:",len(files))
print("Excel procesados:",len(frames))
print("Atenciones consolidadas:",len(df))
print("Filas agregadas:",len(facts))
print("Chunks generados:",len(chunks))
print("Tamano maximo objetivo por chunk: 8 MB")
print("\nSube a GitHub:")
print("- data/index.json")
print("- data/metadata.json")
print("- todos los data/chunk_XXX.json")
input("\nPresiona ENTER para cerrar...")
