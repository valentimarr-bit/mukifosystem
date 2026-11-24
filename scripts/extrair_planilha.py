"""Extrai os dados da planilha antiga (legado/planilha) para seed/planilha.json.

Uso (na raiz do repo):  python3 -I scripts/extrair_planilha.py
Precisa de: openpyxl (pip install openpyxl)
"""
import csv, glob, json, os, runpy, sys, tempfile, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEG = os.path.join(RAIZ, 'legado', 'planilha')
SAIDA = os.path.join(RAIZ, 'seed', 'planilha.json')

# Roda o gerador da planilha só para ler as constantes (gera um xlsx temporário e descarta).
_tmp = tempfile.mkdtemp()
_argv = sys.argv
sys.argv = ['gerar_planilha.py', os.path.join(_tmp, 'x.xlsx')]
_stdout = sys.stdout; sys.stdout = open(os.devnull, 'w')
try:
    g = runpy.run_path(os.path.join(LEG, 'gerar_planilha.py'))
finally:
    sys.stdout.close(); sys.stdout = _stdout; sys.argv = _argv

P = runpy.run_path(os.path.join(LEG, 'dados', 'precos_referencia.py'))['P']

FRAC, ALCO_CAT, VINHOS = g['FRAC'], ('Destilados', 'Licores e aperitivos'), g['VINHOS']
PP = 'Produção própria'


def arredondamento(nome, cat):
    if nome in FRAC: return 'meio'
    if cat in ALCO_CAT: return 'garrafa_proxima'
    return 'inteiro_cima'


insumos = []
for nome, cat, un, emb, cont in g['INS']:
    forn = g['IFORN'].get(nome, [])
    insumos.append({
        'nome': nome, 'tipo': cat, 'unidade_ficha': un, 'embalagem': emb, 'conteudo': cont,
        'arredondamento': arredondamento(nome, cat),
        'consumo_inteiro': cat == 'Não alcoólicos',            # consumo arredondado p/ cima (unidades inteiras)
        'producao_propria': bool(forn) and forn[0] == PP,
        'fornecedor': forn[0] if forn else None,
        'outros_fornecedores': forn[1:],
        'preco_referencia': P.get(nome),                         # estimativa, NÃO é custo real
        'consumo_sabado_ref': round(g['SAT'][nome], 6),          # unidades consumidas num sábado de referência
    })

produtos = []
for nome, itens in g['F']:
    ficha = [{'insumo': i, 'quantidade': q, 'observacao': o} for i, q, o in itens if i != g['NOSTOCK']]
    produtos.append({
        'nome': nome,
        'preco_venda': g['PRICE'].get(nome.upper()),
        'baixa_estoque': all(i != g['NOSTOCK'] for i, _, _ in itens),
        'ficha': ficha,
    })

fornecedores = [{'nome': n, 'como_recebe': c or None, 'observacao': o or None} for n, c, o in g['FORN']]

# Histórico de vendas
HD = os.path.join(LEG, 'dados', 'historico')
fora = json.load(open(os.path.join(HD, 'fora_da_media.json'), encoding='utf-8'))


def ler_relatorio(caminho):
    itens = []
    with open(caminho, encoding='utf-8') as f:
        for r in list(csv.reader(f))[1:]:
            if not r or not r[0].strip(): continue
            itens.append({
                'produto': r[0].strip().replace('"', ''),
                'quantidade': int(r[3].replace('.', '')),
                'total': float(r[4].replace('.', '').replace(',', '.')),
            })
    return itens


historico = []
for arq in sorted(glob.glob(os.path.join(HD, '*.csv'))):
    d, m = os.path.basename(arq)[:-4].split('-')
    dia = datetime.date(2026, int(m), int(d)).isoformat()
    historico.append({'dia': dia, 'fora_da_media': fora.get(dia, '') or None, 'itens': ler_relatorio(arq)})
historico.sort(key=lambda x: x['dia'])

dados = {
    'gerado_de': 'legado/planilha/gerar_planilha.py',
    'folga_minimo': 0.2,
    'fornecedores': fornecedores,
    'insumos': insumos,
    'produtos': produtos,
    'historico': historico,
    'sabado_referencia': ler_relatorio(os.path.join(LEG, 'dados', 'relatorio_sabado.csv')),
}
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
with open(SAIDA, 'w', encoding='utf-8') as f:
    json.dump(dados, f, ensure_ascii=False, indent=1)
print(f'ok: {len(insumos)} insumos, {len(produtos)} produtos, {len(fornecedores)} fornecedores, '
      f'{len(historico)} dias de histórico -> {os.path.relpath(SAIDA, RAIZ)}')
