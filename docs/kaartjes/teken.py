# Maakt van de OpenStreetMap-gegevens per zaak een klein stratenplan als SVG, in de stijl van een stadsposter.
import json, math, os, sys, unicodedata, re
D=os.path.dirname(os.path.abspath(__file__)); UIT=sys.argv[1]
P=json.load(open(D+"/plekken.json")); R=380
ROOD="#731515"; WATER="#D9D6A6"
DIK={"motorway":2.4,"trunk":2.4,"primary":2.0,"secondary":1.8,"tertiary":1.5,"residential":1.0,"unclassified":1.0,"living_street":0.9,"pedestrian":0.8,"service":0.5}
def slug(s):
    s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+","-",s).strip("-")
def dp(pts,tol):
    if len(pts)<3: return pts
    a,b=pts[0],pts[-1]; dx,dy=b[0]-a[0],b[1]-a[1]; L=math.hypot(dx,dy) or 1e-9
    i,m=0,0
    for k,p in enumerate(pts[1:-1],1):
        d=abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/L
        if d>m: i,m=k,d
    return dp(pts[:i+1],tol)[:-1]+dp(pts[i:],tol) if m>tol else [a,b]
def pad(pts): return "M"+"L".join(f"{x:.1f} {y:.1f}".replace(".0 "," ").replace(".0","") if False else f"{x:.1f} {y:.1f}" for x,y in pts)
for naam,(la,lo) in P.items():
    f=D+"/osm-"+naam.replace(" ","_").replace(".","")+".json"
    if not os.path.exists(f): print("ontbreekt",naam); continue
    E=json.load(open(f))["elements"]
    kx=111320*math.cos(math.radians(la)); ky=111320
    proj=lambda g:((g["lon"]-lo)*kx/R*50+50, (la-g["lat"])*ky/R*50+50)
    water=[]; straten={}
    def lijn(geom): return [proj(g) for g in geom if g]
    for e in E:
        t=e.get("tags",{})
        if e["type"]=="relation":
            for m in e.get("members",[]):
                if m.get("role")=="outer" and m.get("geometry"): water.append(dp(lijn(m["geometry"]),.25))
            continue
        g=e.get("geometry")
        if not g: continue
        if t.get("natural")=="water" or t.get("waterway") in ("riverbank","dock"):
            water.append(dp(lijn(g),.25))
        elif t.get("waterway") in ("canal","river") and not t.get("tunnel"):
            straten.setdefault(("w",2.2),[]).append(dp(lijn(g),.25))
        elif t.get("highway"):
            h=t["highway"].replace("_link","")
            if h not in DIK or t.get("tunnel") in ("yes","building_passage"): continue
            straten.setdefault(("s",DIK[h]),[]).append(dp(lijn(g),.25))
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="v"><rect width="100" height="100"/></clipPath></defs><g clip-path="url(#v)">',f'<rect width="100" height="100" fill="#fff"/>']
    if water: svg.append(f'<path fill="{WATER}" fill-rule="evenodd" d="{"".join(pad(w)+"Z" for w in water if len(w)>2)}"/>')
    for (soort,dik),ls in sorted(straten.items(),key=lambda x:x[0][1]):
        kleur=WATER if soort=="w" else ROOD
        svg.append(f'<path fill="none" stroke="{kleur}" stroke-width="{dik}" stroke-linecap="round" stroke-linejoin="round" d="{"".join(pad(l) for l in ls if len(l)>1)}"/>')
    svg.append('<circle cx="50" cy="50" r="6.5" fill="#fff" stroke="#000" stroke-width="2"/><circle cx="50" cy="50" r="3" fill="#000"/></g></svg>')
    s="".join(svg); open(os.path.join(UIT,slug(naam)+".svg"),"w").write(s); print(slug(naam),len(s))
