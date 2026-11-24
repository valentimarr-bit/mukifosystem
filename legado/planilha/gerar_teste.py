"""Gera a cópia de TESTE com TODAS as lacunas preenchidas com valores aproximados (exemplo).
Uso: python3 gerar_teste.py   (os contatos e observações de fornecedores são fictícios)"""
import os, sys, subprocess, random
from openpyxl import load_workbook
D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(D, 'dados'))
from precos_referencia import P
random.seed(21)
base = os.path.join(D, 'saida', '_base_com_vendas.xlsx')
subprocess.run([sys.executable, os.path.join(D, 'gerar_planilha.py'), base,
                os.path.join(D, 'dados', 'relatorio_colado_coluna_A.txt')], check=True)
import tempfile, shutil
_tmp = tempfile.mkdtemp()
subprocess.run(['soffice', '--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', _tmp, base],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
_calc = load_workbook(os.path.join(_tmp, os.path.basename(base)), data_only=True)['Estoque']
MINSEG = {_calc.cell(i, 1).value: _calc.cell(i, 11).value for i in range(6, 90) if _calc.cell(i, 1).value}
shutil.rmtree(_tmp)
wb = load_workbook(base)
e, c, f, wf, wl, wp = (wb[n] for n in ('Estoque', 'Compras', 'Ficha', 'Fornecedores', 'Lista de Compras', 'Produção'))
PROD = ('Xarope', 'Espuma', 'Infusão')

# --- Estoque: Início (contagem), Esperado (semana passada), Preço ---
ini = open(os.path.join(D, 'dados', 'teste_estoque_inicio.txt')).read().split()
names = []
for i, v in enumerate(ini, start=6):
    n = e.cell(i, 1).value; names.append(n)
    x = float(v.replace(',', '.'))
    if n.startswith(PROD): x = 0.5 if 'Espuma' not in n else 2        # pouco preparo -> aparece na Produção
    e.cell(i, 6, x)
    inteiro = e.cell(i, 6).number_format.startswith('#,##0;')
    perda = random.choice([0, 0, 0, 1, 1, 2]) if inteiro else random.choice([0, 0.25, 0.5])
    e.cell(i, 15, x + perda)                                           # esperado >= contado (pequenas perdas)
    e.cell(i, 17, P[n])
e['B2'] = 'Quinta'

# --- Compras: quantidade, valor, fornecedor ---
for i in range(2, 80):
    n = c.cell(i, 1).value
    if n in names:
        r = 6 + names.index(n)
        q = 2 if n.startswith(PROD) and 'Espuma' not in n else (5 if 'Espuma' in n else MINSEG[n])
        c.cell(i, 3, q); c.cell(i, 4, round(q * P[n] * random.uniform(0.95, 1.05), 2))
        c.cell(i, 6, e.cell(r, 18).value or 'Ceasa')

# --- Ficha: preço de venda dos drinks que ainda não tinham ---
for r in range(2, f.max_row + 1):
    if f.cell(r, 1).value and f.cell(r, 3).value is None and not str(f.cell(r, 2).value or '').startswith('=IF(A'):
        f.cell(r, 3, 30)

# --- Fornecedores: como recebe, contato e observação (EXEMPLOS fictícios) ---
como = {'NW': 'Entrega no bar', 'Sanguiné': 'Entrega no bar', 'Ambev': 'Entrega no bar (vendedor)',
        'Fensa (Coca-Cola)': 'Entrega no bar', 'Desco': 'Entrega no bar', 'Gabriel': 'Entrega no bar',
        'GW': 'Entrega no bar', 'Leandro (Bar Metz)': 'Retirar no Bar Metz', 'SOS Alimentos': 'Entrega no bar',
        'Vinícola De Cesaro': 'Retirar'}
for i in range(2, 41):
    n = wf.cell(i, 1).value
    if not n: continue
    if not wf.cell(i, 2).value: wf.cell(i, 2, como.get(n, 'Retirar'))
    wf.cell(i, 3, f'(51) 90000-{i:04d}')
    if not wf.cell(i, 4).value: wf.cell(i, 4, 'Exemplo: pedir até as 16h')

# --- Lista de Compras: alguns itens já marcados como comprados ---
for r in range(5, 10): wl.cell(r, 7, 'X')
# --- Produção: gelo de quarta e quinta feito; primeiro preparo feito ---
wp['C5'] = 'X'; wp['C6'] = 'X'; wp['D13'] = 'X'

wi = wb['IMPRESSÕES']
# --- IMPRESSÕES: dia e início do movimento ---
wi['B2'] = 'Sexta'
inicio = {'litros': 1.5, 'talagaços': 3, 'sacos de 5 L': 4, 'limões': 20, 'fatias': 6, 'maços': 1, 'unidades': 6}
for rr in range(6, 40):
    m = wi.cell(rr, 2).value
    if m in inicio: wi.cell(rr, 3, inicio[m])

wb.save(os.path.join(D, 'saida', 'Controle_Estoque_Bar_TESTE.xlsx')); os.remove(base)
print('ok: saida/Controle_Estoque_Bar_TESTE.xlsx')
