"""Recalcula a planilha de TESTE com o LibreOffice e salva os valores que ela calcula em test/gabarito.json.
Os testes do sistema novo comparam as contas com este gabarito: os números têm que bater com a planilha.

Uso (na raiz do repo):  python3 -I scripts/gerar_gabarito.py
Precisa de: openpyxl e LibreOffice (soffice).
"""
import json, os, shutil, subprocess, tempfile
from openpyxl import load_workbook

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTE = os.path.join(RAIZ, 'legado', 'planilha', 'saida', 'Controle_Estoque_Bar_TESTE.xlsx')
SAIDA = os.path.join(RAIZ, 'test', 'gabarito.json')

tmp = tempfile.mkdtemp()
subprocess.run(['soffice', '--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', tmp, TESTE],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
wb = load_workbook(os.path.join(tmp, os.path.basename(TESTE)), data_only=True)
shutil.rmtree(tmp)

e = wb['Estoque']
estoque = []
for i in range(6, e.max_row + 1):
    n = e.cell(i, 1).value
    if not n: break
    v = lambda c: e.cell(i, c).value
    estoque.append({
        'insumo': n, 'inicio': v(6), 'compra': v(7), 'consumo_qtd': v(8), 'consumo_un': v(9), 'atual': v(10),
        'minimo_segunda': v(11), 'minimo_quinta': v(12), 'situacao': v(13), 'sugestao': v(14), 'preco': v(17),
        'consumo_dia': [v(c) for c in range(23, 29)],
    })

f = wb['Ficha']
fichas = []
for r in range(2, f.max_row + 1):
    p = f.cell(r, 1).value
    if p and isinstance(f.cell(r, 2).value, (int, float)):
        fichas.append({'produto': p, 'cmv': f.cell(r, 2).value, 'preco': f.cell(r, 3).value,
                       'vendidos': f.cell(r, 10).value})

m = wb['Média por Dia']
medias = {}
for r in range(2, m.max_row + 1):
    p = m.cell(r, 1).value
    if not p or p.startswith('Média de'): continue
    medias[p] = [m.cell(r, c).value if isinstance(m.cell(r, c).value, (int, float)) else None for c in range(2, 8)]

h = wb['Histórico 30 dias']
dias_validos = [h.cell(k, 10).value for k in range(2, 8)]

gab = {'dia_compra': e['B2'].value, 'folga': e['B3'].value, 'dias_validos': dias_validos,
       'estoque': estoque, 'fichas': fichas, 'medias': medias}
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
json.dump(gab, open(SAIDA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'ok: {len(estoque)} itens de estoque, {len(fichas)} fichas, {len(medias)} médias -> {os.path.relpath(SAIDA, RAIZ)}')
