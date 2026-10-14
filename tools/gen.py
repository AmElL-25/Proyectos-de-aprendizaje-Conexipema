import json
from collections import Counter
from d_mkt import M; from d_ads import A; from d_est import E; from d_fin import F
D={'Marketing':('mkt',M),'Publicidad digital':('ads',A),'Estrategia de negocio':('est',E),'Finanzas':('fin',F)}
out=[]
for cat,(p,arr) in D.items():
  for i,(t,en,l,ex,eg,q,a) in enumerate(arr):
    out.append(dict(id=f"{p}{i+1:02d}",term=t,en="" if en==t else en,category=cat,level=l,explanation=ex,example=eg,question=q,answer=a))
open('../terms.js','w').write("/* Banco de términos – Término del Día */\nvar TERMS = (typeof window !== 'undefined' ? window : globalThis).TERMS = "+json.dumps(out,ensure_ascii=False,indent=1)+";\nif (typeof module !== 'undefined') module.exports = TERMS;\n")
print(len(out),Counter(o['category'] for o in out),Counter(o['level'] for o in out))
