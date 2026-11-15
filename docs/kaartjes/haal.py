# Haalt de straten en het water rond elke zaak op bij OpenStreetMap (Overpass). Kopieer dit script en teken.py
# naar een tijdelijke map en draai ze daar: python3 haal.py, daarna python3 teken.py <repo>/assets/img/kaartjes.
# Een nieuwe zaak: zet naam en coördinaten (uit openstreetmap.org) in P.
import json, time, math, urllib.request, urllib.parse, os, sys
D=os.path.dirname(os.path.abspath(__file__))
P={"4850":(52.35779,4.91333),"De Badcuyp":(52.35659,4.89711),"Domenica":(52.38013,4.88743),"Restaurant Entrepot":(52.36963,4.91196),"Gebr. Hartering":(52.37164,4.90747),"Oocker":(52.36132,4.90060),"Café Parlotte":(52.37825,4.88175),"Wijnbar Paskamer":(52.35083,4.89778),"Café-Bar Vita Lente":(52.36363,4.86323),"Café Kiem":(51.92725,4.47281),"De Matroos en het Meisje":(51.90113,4.48474),"NOTK Wine & Food":(51.90129,4.48590),"Alma":(51.58112,5.19722),"Café de Lepelaar":(52.50794,4.84805),"De Librije":(52.51555,6.09756),"Restaurant Loca":(51.98907,5.92588),"Café-Restaurant Terroir":(52.08596,5.12462),"Bouzy":(52.08634,4.31161),"Utregs Wijnbar":(52.08596,5.12462)}
json.dump(P,open(D+"/plekken.json","w"))
R=380  # meter
SERVERS=["https://overpass-api.de/api/interpreter"]
for naam,(la,lo) in P.items():
    f=D+"/osm-"+naam.replace(" ","_").replace(".","")+".json"
    if os.path.exists(f): continue
    dla=R/111320; dlo=R/(111320*math.cos(math.radians(la)))
    bb=f"{la-dla},{lo-dlo},{la+dla},{lo+dlo}"
    q=f'[out:json][timeout:60];(way[highway]({bb});way[natural=water]({bb});way[waterway]({bb});relation[natural=water]({bb});way[leisure=park]({bb}););out geom({bb});'
    wacht=10; i=0
    while True:
        u=SERVERS[i%len(SERVERS)]; i+=1
        try:
            import subprocess
            r=subprocess.run(["curl","-s","-m","90","-A","VMV-Wijnimport-site (info@vmvwijnimport.com)","--data-urlencode","data="+q,u],capture_output=True).stdout
            j=json.loads(r); open(f,"wb").write(r); print("ok",naam,len(j["elements"]),flush=True); break
        except Exception as e:
            print("wacht",naam,u[:30],str(e)[:60],wacht,flush=True); time.sleep(wacht); wacht=min(wacht*2,120)
    time.sleep(3)
print("klaar")
