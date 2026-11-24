import csv, glob, os, datetime, statistics as st, json
import os as _os; DIR=_os.path.join(_os.path.dirname(_os.path.abspath(__file__)),"dados","historico")
dates=["2026-10-20","2026-10-21","2026-10-22","2026-10-23","2026-10-24","2026-10-25","2026-10-26","2026-10-27","2026-10-28","2026-10-29","2026-10-30","2026-10-31","2026-11-01","2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06","2026-11-07","2026-11-08","2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13","2026-11-14","2026-11-15","2026-11-16","2026-11-17","2026-11-18","2026-11-19","2026-11-20"]
mm=[0.00,0.00,0.00,0.20,10.10,6.40,1.00,0.00,0.00,0.10,2.30,0.00,0.00,8.80,0.00,53.60,1.70,0.10,12.10,2.90,0.10,0.00,9.40,0.00,0.40,0.40,17.20,0.00,0.40,0.70,6.90,8.90]
hh=[0.0,0.0,0.0,2.0,13.0,20.0,7.0,0.0,0.0,1.0,8.0,0.0,0.0,3.0,0.0,16.0,4.0,1.0,21.0,8.0,1.0,0.0,5.0,0.0,4.0,2.0,12.0,0.0,2.0,1.0,13.0,10.0]
RAIN={datetime.date.fromisoformat(d):(a,b) for d,a,b in zip(dates,mm,hh)}
FER={datetime.date(2026,11,15):'Feriado (Proclamação da República)',datetime.date(2026,11,20):'Feriado (Consciência Negra)',
     datetime.date(2026,11,1):'Véspera de feriado (Finados 02/11)',datetime.date(2026,11,19):'Véspera de feriado (20/11)'}
NOME=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo']
days={}
for f in glob.glob(DIR+'/*.csv'):
    d,m=os.path.basename(f)[:-4].split('-'); dt=datetime.date(2026,int(m),int(d))
    prods={}; tot=0
    for r in list(csv.reader(open(f,encoding='utf-8')))[1:]:
        if not r[0].strip(): continue
        n=int(r[3].replace('.','')); v=float(r[4].replace('.','').replace(',','.'))
        p=r[0].strip(); prods[p]=prods.get(p,0)+n; tot+=v
    days[dt]={'tot':tot,'prods':prods}
res=[]; kept={}
for wd in range(7):
    ds=sorted(d for d in days if d.weekday()==wd)
    med=st.median(days[d]['tot'] for d in ds)
    for d in ds:
        t=days[d]['tot']; mmv,hv=RAIN[d]; motivo=''
        if wd==0: motivo='Segunda: bar fechado (só almoço)'
        elif d in FER: motivo=FER[d]
        elif mmv>=5 and hv>=8 and t<med*0.8: motivo=f'Chuva forte ({mmv:.0f} mm, {hv:.0f} h) e venda baixa'
        elif abs(t/med-1)>0.35: motivo='Venda muito '+('acima' if t>med else 'abaixo')+' das outras '+NOME[wd].lower()+'s'
        res.append((d,NOME[wd],t,mmv,hv,motivo))
        if not motivo: kept.setdefault(wd,[]).append(d)
json.dump({'res':[(d.isoformat(),n,t,a,b,m) for d,n,t,a,b,m in res]},open('res.json','w'),ensure_ascii=False)
for d,n,t,a,b,m in sorted(res): print(d.strftime('%d/%m'),n[:3],f'R$ {t:8.2f}',f'{a:5.1f}mm {b:4.0f}h', '✗ '+m if m else '✓')
print()
sat=st.mean(days[d]['tot'] for d in kept[5])
for wd in range(1,7):
    v=[days[d]['tot'] for d in kept[wd]]
    print(NOME[wd], len(v),'dias', f'média R$ {st.mean(v):.0f}', f'= {st.mean(v)/sat:.2f} sábado')
import pickle; pickle.dump((days,kept,res),open('dados.pkl','wb'))
