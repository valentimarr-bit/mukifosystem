import sys, os
DIAS6 = ['Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
WD = [3, 4, 5, 6, 7, 1]
PESO = [1/3, 1/3, 1/3, 1, 1, 1/3]   # referência quando não há histórico daquele dia
DAYS = lambda k: f"'Histórico 30 dias'!$J${k + 2}"
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule, CellIsRule
from openpyxl.worksheet.formula import ArrayFormula

OUT = sys.argv[1]
TEST_CSV = sys.argv[2] if len(sys.argv) > 2 else None

# ---------------- INSUMOS ----------------
# (nome, categoria, unidade base, embalagem, conteúdo da embalagem na unidade base)
INS = [
 # Destilados
 ("Cachaça Ypióca Ouro","Destilados","ml","Garrafa 965 ml",965),
 ("Cachaça Velho Barreiro","Destilados","ml","Garrafa 910 ml",910),
 ("Cachaça Kariri","Destilados","ml","Garrafa 700 ml",700),
 ("Cachaça Ypióca Branca","Destilados","ml","Garrafa 1 L",1000),
 ("Vodka Smirnoff","Destilados","ml","Garrafa 998 ml",998),
 ("Vodka Absolut","Destilados","ml","Garrafa 1 L",1000),
 ("Whisky Passport","Destilados","ml","Garrafa 1 L",1000),
 ("Whisky White Horse","Destilados","ml","Garrafa 1 L",1000),
 ("Whisky Red Label","Destilados","ml","Garrafa 1 L",1000),
 ("Whisky Jack Daniel's","Destilados","ml","Garrafa 1 L",1000),
 ("Whisky Johnnie Walker Blonde","Destilados","ml","Garrafa 750 ml",750),
 ("Gin Gordon's","Destilados","ml","Garrafa 750 ml",750),
 ("Gin Tanqueray","Destilados","ml","Garrafa 750 ml",750),
 ("Infusão gin + hibisco + pimenta rosa","Destilados","ml","Litro (produção)",1000),
 ("Tequila Tequisla","Destilados","ml","Garrafa 1 L",1000),
 ("Tequila José Cuervo","Destilados","ml","Garrafa 750 ml",750),
 ("Rum Montilla Ouro","Destilados","ml","Garrafa 1 L",1000),
 ("Rum Montilla Prata","Destilados","ml","Garrafa 1 L",1000),
 ("Fireball","Destilados","ml","Garrafa 750 ml",750),
 ("Howler Head","Destilados","ml","Garrafa 750 ml",750),
 # Licores, aperitivos e vinhos
 ("Jägermeister","Licores e aperitivos","ml","Garrafa 700 ml",700),
 ("Aperol","Licores e aperitivos","ml","Garrafa 750 ml",750),
 ("Campari","Licores e aperitivos","ml","Garrafa 998 ml",998),
 ("Vermute rosso","Licores e aperitivos","ml","Garrafa 1 L",1000),
 ("Cynar","Licores e aperitivos","ml","Garrafa 900 ml",900),
 ("Cointreau","Licores e aperitivos","ml","Garrafa 700 ml",700),
 ("Fernet","Licores e aperitivos","ml","Garrafa 750 ml",750),
 ("Conhaque de alcatrão São João da Barra","Licores e aperitivos","ml","Garrafa 900 ml",900),
 ("Angostura","Licores e aperitivos","ml","Frasco 200 ml",200),
 ("Espumante brut Salton Séries","Licores e aperitivos","ml","Garrafa 750 ml",750),
 ("Vinho tinto De Cesaro","Licores e aperitivos","ml","Garrafa 750 ml",750),
 # Cervejas (revenda)
 ("Beats Green Mix LN 269ml","Cervejas","un","Unidade",1),
 ("Beats GT LN 269ml","Cervejas","un","Unidade",1),
 ("Beats Red Mix LN 269ml","Cervejas","un","Unidade",1),
 ("Beats Senses LN 269ml","Cervejas","un","Unidade",1),
 ("Beats Pink Lemonade LN 269ml","Cervejas","un","Unidade",1),
 ("Brahma Chopp litrão 1L","Cervejas","un","Unidade",1),
 ("Corona LN 330ml","Cervejas","un","Unidade",1),
 ("Heineken 0,0% LN 330ml","Cervejas","un","Unidade",1),
 ("Heineken 600ml","Cervejas","un","Unidade",1),
 ("Heineken lata 473ml","Cervejas","un","Unidade",1),
 ("Heineken LN 330ml","Cervejas","un","Unidade",1),
 ("Heineken Ultimate LN","Cervejas","un","Unidade",1),
 ("Original garrafa 1L","Cervejas","un","Unidade",1),
 ("Original lata 473ml","Cervejas","un","Unidade",1),
 ("Stella Artois LN 330ml","Cervejas","un","Unidade",1),
 ("Stella Gold s/ glúten LN","Cervejas","un","Unidade",1),
 # Não alcoólicos
 ("Água com gás","Não alcoólicos","ml","Garrafa 500 ml",500),
 ("Água sem gás","Não alcoólicos","un","Unidade",1),
 ("Coca-Cola lata 350ml","Não alcoólicos","ml","Lata 350 ml",350),
 ("Coca-Cola Zero lata 350ml","Não alcoólicos","un","Unidade",1),
 ("Sprite lata 350ml","Não alcoólicos","un","Unidade",1),
 ("Água tônica","Não alcoólicos","ml","Lata 350 ml",350),
 ("Baly tradicional","Não alcoólicos","ml","Garrafa 2 L",2000),
 ("Red Bull 250ml","Não alcoólicos","ml","Lata 250 ml",250),
 ("Red Bull Melancia 250ml","Não alcoólicos","un","Unidade",1),
 ("Red Bull Tropical 250ml","Não alcoólicos","ml","Lata 250 ml",250),
 ("Monster Mango Loco 473ml","Não alcoólicos","ml","Lata 473 ml",473),
 ("Monster Original 473ml","Não alcoólicos","ml","Lata 473 ml",473),
 ("Monster Zero 473ml","Não alcoólicos","un","Unidade",1),
 ("Matito (drink pronto 1 L)","Não alcoólicos","un","Unidade",1),
 # Xaropes e sucos
 ("Xarope de açúcar (simples)","Xaropes e sucos","ml","Litro (produção)",1000),
 ("Xarope de mel","Xaropes e sucos","ml","Litro (produção)",1000),
 ("Xarope de gengibre","Xaropes e sucos","ml","Litro (produção)",1000),
 ("Xarope de cranberry Monin","Xaropes e sucos","ml","Garrafa 700 ml",700),
 ("Suco de maracujá concentrado","Xaropes e sucos","ml","Garrafa 500 ml",500),
 ("Espuma cítrica de gengibre","Xaropes e sucos","talagaço","Talagaço",1),
 # Hortifruti e guarnições
 ("Limão Taiti","Hortifruti","kg","kg",1),
 ("Limão Siciliano","Hortifruti","kg","kg",1),
 ("Laranja","Hortifruti","un","Unidade",1),
 ("Manjericão","Hortifruti","maço","Maço",1),
 ("Hortelã","Hortifruti","maço","Maço",1),
 ("Pimenta rosa","Hortifruti","g","Pacote 100 g",100),
 ("Ovo","Hortifruti","un","Dúzia",12),
 # Descartáveis e gelo
 ("Copo descartável 400ml","Descartáveis","un","Pacote 50 un",50),
 ("Copo descartável 700ml","Descartáveis","un","Pacote 50 un",50),
 # Cozinha e outros
 ("Batata congelada para fritar","Cozinha","g","Pacote 2 kg",2000),
 ("Seda","Outros","un","Unidade",1),
]
NAMES = {i[0] for i in INS}

# ---------------- FICHAS (Stok) ----------------
C4, C7 = "Copo descartável 400ml", "Copo descartável 700ml"
G4, G7 = 200, 350  # gelo estimado (g)
GELO = "Gelo estimado"
def c4(): return [(C4,1,"")]
def c7(): return [(C7,1,"")]
NOSTOCK = "(não movimenta estoque)"

F = []  # (produto, [(insumo, qtd, obs)])
def add(p, items): F.append((p, items))

# Drinks do anexo que aparecem no relatório
add("CAIPIRINHA CACHAÇA",[("Cachaça Ypióca Ouro",50,""),("Suco de limão Taiti",50,""),("Xarope de açúcar (simples)",50,"")]+c4())
add("CAIPIROSKA VODKA",[("Vodka Smirnoff",50,""),("Suco de limão Taiti",50,""),("Xarope de açúcar (simples)",50,"")]+c4())
add("PROMO CAIPIRINHA DOSE DUPLA",[("Cachaça Ypióca Ouro",100,"Equivale a 2 caipirinhas"),("Suco de limão Taiti",100,""),("Xarope de açúcar (simples)",100,""),(C4,2,"")])
add("CAIPA COPÃO PROMO",[("Cachaça Velho Barreiro",100,""),("Suco de limão Taiti",100,""),("Xarope de açúcar (simples)",100,"")]+c7())
add("MUKIFO",[("Tequila Tequisla",75,""),("Monster Mango Loco 473ml",236,""),("Xarope de cranberry Monin",20,""),("Pimenta rosa",1,"Decoração: estimei 1 g")]+c7())
add("KIT DOS GURI",[("Whisky Passport",75,""),("Baly tradicional",250,"")]+c7())
add("Kit maki",[("Whisky White Horse",75,""),("Monster Original 473ml",236,"")]+c7())
add("FERNET COLA 400ML",[("Fernet",50,""),("Coca-Cola lata 350ml",200,"")]+c4())
add("FERNET COLA 700ML",[("Fernet",75,""),("Coca-Cola lata 350ml",350,"")]+c7())
add("WHISKY & REDBULL",[("Whisky Red Label",75,""),("Red Bull 250ml",250,"")]+c7())
add("VODKA & REDBULL",[("Vodka Absolut",75,""),("Red Bull 250ml",250,"")]+c7())
add("JACK COM ENERGETICO",[("Whisky Jack Daniel's",75,""),("Red Bull 250ml",250,"")]+c7())
add("JAGERBOMB 700ML",[("Jägermeister",75,""),("Red Bull 250ml",250,"1 lata"),("Laranja",0.5,"1/2 fatia")]+c7())
add("PENICILIN",[("Whisky Red Label",45,""),("Suco de limão siciliano",30,""),("Xarope de gengibre",20,""),("Xarope de mel",10,""),("Conhaque de alcatrão São João da Barra",5,"")]+c4())
add("APEROL SPRITZ",[("Aperol",60,""),("Espumante brut Salton Séries",90,""),("Água com gás",15,"")]+c4())
add("GIN TONICA",[("Gin Gordon's",50,""),("Água tônica",200,""),("Limão Taiti (fruta)",0.125,"1 rodela ≈ 1/8 de limão")]+c4())
add("KURTZ N' COKE 700ML",[("Jägermeister",75,""),("Coca-Cola lata 350ml",350,"")]+c7())
add("MOSCOW MULE",[("Vodka Smirnoff",60,""),("Suco de limão Taiti",25,""),("Água com gás",50,""),("Espuma cítrica de gengibre",1,"1 talagaço")]+c4())
add("WHISKY SOUR",[("Whisky Red Label",60,""),("Suco de limão Taiti",25,""),("Xarope de açúcar (simples)",20,""),("Ovo",1,"1 clara"),("Angostura",0.15,"3 gotas ≈ 0,15 ml")]+c4())
add("AMANSA LOUCO",[("Vodka Smirnoff",60,""),("Suco de maracujá concentrado",30,""),("Xarope de mel",50,""),("Suco de limão Taiti",20,""),("Manjericão",10,"")]+c4())
add("TROPICAL GIN",[("Gin Gordon's",75,""),("Red Bull Tropical 250ml",250,"")]+c7())
add("JÄGER BUCK",[("Jägermeister",75,""),("Suco de limão Taiti",25,""),("Xarope de gengibre",20,""),("Água com gás",50,"")]+c7())
add("NEGRONI",[("Gin Gordon's",30,""),("Vermute rosso",30,""),("Campari",30,"")]+c4())
add("KARIREL",[("Cachaça Kariri",50,""),("Cynar",10,""),("Xarope de mel",30,"")]+c4())
add("MATITO",[("Matito (drink pronto 1 L)",1,"")])
add("BATATA FRITA G",[("Batata congelada para fritar",500,"")])
# Doses
add("DOSE GIN GORDONS",[("Gin Gordon's",50,"")])
add("DOSE JOHNNIE BLONDE",[("Whisky Johnnie Walker Blonde",50,"")])
add("DOSE TANQUERAY GIN",[("Gin Tanqueray",50,"")])
add("DOSE TEQUILA",[("Tequila José Cuervo",50,"")])
# Revenda 1:1
for p,i,q in [("ÁGUA C/ GÁS","Água com gás",500),("ÁGUA S/ GÁS","Água sem gás",1),
  ("BEATS GREEN MIX LONG NECK 269ML","Beats Green Mix LN 269ml",1),("BEATS GT LONG NECK 269ML","Beats GT LN 269ml",1),
  ("BEATS RED MIX LONG NECK 269ML","Beats Red Mix LN 269ml",1),("BEATS SENSES LONG NECK 269ML","Beats Senses LN 269ml",1),
  ("BRAHMA CHOPP LITRAO 1L","Brahma Chopp litrão 1L",1),("COCA COLA 350ML","Coca-Cola lata 350ml",350),
  ("COCA COLA ZERO 350ML","Coca-Cola Zero lata 350ml",1),("CORONA LN 355ML/330ML","Corona LN 330ml",1),
  ("ENERGETICO MONSTER 473ML LT MANGO LOCO","Monster Mango Loco 473ml",473),("ENERGÉTICO MONSTER ZERO","Monster Zero 473ml",1),
  ("HEINEKEN 0,0% LONG NECK 330ML","Heineken 0,0% LN 330ml",1),("HEINEKEN 600ML","Heineken 600ml",1),
  ("HEINEKEN LATA 473ML","Heineken lata 473ml",1),("HEINEKEN LONG NECK 330ML","Heineken LN 330ml",1),
  ("HEINEKEN ULTIMATE LONG NECK","Heineken Ultimate LN",1),("ORIGINAL GARRAFA 1L","Original garrafa 1L",1),
  ("ORIGINAL LATA 473ML","Original lata 473ml",1),("RED BULL 250ML","Red Bull 250ml",250),
  ("RED BULL MELANCIA 250ML","Red Bull Melancia 250ml",1),("SPRITE LATA 350ML","Sprite lata 350ml",1),
  ("STELLA ARTOIS LONG NECK 330ML","Stella Artois LN 330ml",1),("STELLA GOLD S/ GLUTEN LONG NECK","Stella Gold s/ glúten LN",1),
  ("Seda","Seda",1)]:
    add(p,[(i,q,"")])
add("PROMO HEINEKEN 600ML",[("Heineken 600ml",2,"Promo = 2 garrafas")])
add("PROMO HEINEKEN LATÃO",[("Heineken lata 473ml",3,"Promo = 3 latões")])
add("PROMO HEINEKEN LONGNECK",[("Heineken LN 330ml",3,"Promo = 3 long necks")])
# Do histórico de 30 dias: promos e doses de itens que já existem
def _copia(nome, de, obs=""):
    for _p, _it in F:
        if _p == de:
            add(nome, [(i, q, (obs if k == 0 and obs else o)) for k, (i, q, o) in enumerate(_it)]); return
    raise KeyError(de)
_copia("MUKIFO PROMO", "MUKIFO", "Mesma receita do Mukifo")
_copia("JAGERBOMB PROMO JAGERDAY", "JAGERBOMB 700ML", "Mesma receita do Jagerbomb")
_copia("KURTZ N COKE PROMO JAGERDAY", "KURTZ N' COKE 700ML", "Mesma receita do Kurtz'n'coke")
_copia("KIT DOS GURI PROMO", "KIT DOS GURI", "Mesma receita do Kit dos Guri")
add("LITRÃO BRAHMA PROMO",[("Brahma Chopp litrão 1L",1,"CONFIRMAR quantos litrões vêm na promo")])
add("LITRÃO ORIGINAL PROMO",[("Original garrafa 1L",1,"CONFIRMAR quantos litrões vêm na promo")])
for _n, _i in [("DOSE JAGER","Jägermeister"),("DOSE SMIRNOFF","Vodka Smirnoff"),("DOSE CAMPARI","Campari"),
               ("DOSE JACK DANIEL'S","Whisky Jack Daniel's"),("DOSE PASSPORT","Whisky Passport"),("DOSE FIREBALL","Fireball"),
               ("DOSE RED LABEL","Whisky Red Label"),("DOSE VELHO BARREIRO","Cachaça Velho Barreiro"),("DOSE FERNET","Fernet")]:
    add(_n, [(_i, 50, "")])
add("REDBULL TROPICAL 250ML",[("Red Bull Tropical 250ml",250,"")])
add("ENERGETICO MONSTER ENERGY LT 473ML",[("Monster Original 473ml",473,"")])
add("WHITE HORSE CM BALY",[("Whisky White Horse",75,"CONFIRMAR: montei igual ao Kit dos Guri"),("Baly tradicional",250,"")]+c7())
add("JÄGER TONIC",[("Jägermeister",50,"CONFIRMAR: estimei 50 ml de Jäger + 200 ml de tônica"),("Água tônica",200,"")]+c4())
# Não movimentam estoque
add("FICHA DE SINUCA DEB/CRED",[(NOSTOCK,0,"Serviço — sem insumo")])
add("FICHA DE SINUCA PIX",[(NOSTOCK,0,"Serviço — sem insumo")])
# Drinks do anexo que NÃO apareceram no relatório (nome precisa ficar igual ao do sistema)
FUT = "Não apareceu no relatório: o nome tem que ficar igual ao do sistema"
add("MACACO LOCO",[("Rum Montilla Ouro",40,FUT),("Howler Head",20,""),("Vermute rosso",10,""),("Suco de limão siciliano",20,""),("Xarope de açúcar (simples)",15,"")]+c4())
add("PINK GT",[("Infusão gin + hibisco + pimenta rosa",60,FUT),("Água tônica",150,"")]+c4())
add("SOU EU BOLA DE FOGO",[("Fireball",50,FUT),("Xarope de mel",25,""),("Suco de limão Taiti",30,""),("Vinho tinto De Cesaro",25,"")]+c4())
add("MOJITO",[("Rum Montilla Prata",50,FUT),("Suco de limão Taiti",30,""),("Xarope de açúcar (simples)",25,""),("Hortelã",12,""),("Água com gás",50,"")]+c4())
add("FITZGERALD",[("Gin Gordon's",50,FUT+" (ficha diz só 'gin')"),("Xarope de açúcar (simples)",15,""),("Suco de limão siciliano",20,""),("Angostura",2.4,"3 dashes ≈ 2,4 ml")]+c4())
add("MACUNAIMA",[("Cachaça Ypióca Branca",45,""),("Suco de limão Taiti",25,""),("Xarope de açúcar (simples)",20,""),("Fernet",7,""),(C4,1,"CONFIRMAR: ficha não traz copo")])
add("NEGRITO",[("Jägermeister",30,FUT),("Cointreau",30,""),("Gin Gordon's",30,"Ficha diz só 'gin'")]+c4())
add("JAGERINHA",[("Jägermeister",60,""),("Suco de limão Taiti",30,""),("Xarope de açúcar (simples)",40,""),("Limão Taiti (fruta)",0.5,"")]+c4())

# ---------------- CONVERSÃO: controle pela fruta / maço / unidade comprada ----------------
CONV = {  # nome antigo -> (nome novo, fator, texto da observação)
    "Suco de limão Taiti": ("Limão Taiti", 1/400, "{q:g} ml de suco"),
    "Limão Taiti (fruta)": ("Limão Taiti", 0.1, "{q:g} limão"),
    "Suco de limão siciliano": ("Limão Siciliano", 1/350, "{q:g} ml de suco"),
    "Laranja": ("Laranja", 1/8, "{q:g} fatia"),
    "Manjericão": ("Manjericão", 1/50, "{q:g} folhas"),
    "Hortelã": ("Hortelã", 1/50, "{q:g} folhas"),
}
F2 = []
for p, items in F:
    out = {}; order = []
    for ins, q, obs in items:
        if ins in CONV:
            new, fac, txt = CONV[ins]
            o = txt.format(q=q).replace('.', ',')
            if obs and obs not in o: o = obs + ' — ' + o
            ins, q, obs = new, q * fac, o
        if ins in out:
            q0, o0 = out[ins]; out[ins] = (q0 + q, (o0 + ' + ' + obs).strip(' +'))
        else:
            out[ins] = (q, obs); order.append(ins)
    F2.append((p, [(i, round(out[i][0], 4), out[i][1]) for i in order]))
F = F2
for p, items in F:
    for i, _, _ in items:
        assert i in NAMES or i == NOSTOCK, (p, i)

# ---------------- PARÂMETROS a partir do sábado de referência ----------------
import csv as _csv, math
_sold, PRICE = {}, {}
for _r in list(_csv.reader(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'dados','relatorio_sabado.csv'), encoding='utf-8')))[1:]:
    if _r[0].strip():
        k = _r[0].strip().upper(); q = int(_r[3])
        _sold[k] = q
        PRICE[k] = round(float(_r[4].replace('.', '').replace(',', '.')) / q, 2)
for _f in __import__('glob').glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dados', 'historico', '*.csv')):
    for _r in list(_csv.reader(open(_f, encoding='utf-8')))[1:]:
        if _r[0].strip() and int(_r[3].replace('.', '')) > 0:
            _k = _r[0].strip().upper().replace('"', '').replace('  ', ' ')
            _q = int(_r[3].replace('.', '')); _v = float(_r[4].replace('.', '').replace(',', '.'))
            if _k not in PRICE: PRICE[_k] = round(_v / _q, 2)
CONT = {i[0]: i[4] for i in INS}; CAT = {i[0]: i[1] for i in INS}
_use = {n: 0.0 for n in CONT}
for _p, _items in F:
    for _i, _q, _o in _items:
        if _i in _use: _use[_i] += _q * _sold.get(_p.upper(), 0)
SAT = {n: _use[n] / CONT[n] for n in CONT}   # consumo de um sábado, em unidades
FRAC = {"Limão Taiti", "Limão Siciliano", "Xarope de açúcar (simples)", "Xarope de mel",
        "Xarope de gengibre", "Infusão gin + hibisco + pimenta rosa"}
VINHOS = {"Espumante brut Salton Séries", "Vinho tinto De Cesaro"}
ALCO = lambda n: CAT[n] in ("Destilados", "Licores e aperitivos")
INTCAT = lambda n: (CAT[n] in ("Destilados", "Licores e aperitivos", "Cervejas", "Não alcoólicos", "Descartáveis")
                    and n not in VINHOS)
def up(x, n):
    return math.ceil(x * 2) / 2 if n in FRAC else math.ceil(x)
MIN_T, MIN_S = {}, {}
for n in CONT:
    S = SAT[n]
    if CAT[n] == "Não alcoólicos": S = math.ceil(S)
    if S == 0 or (ALCO(n) and S < 0.5):
        MIN_T[n] = MIN_S[n] = (0.5 if n in FRAC else 1)
    else:
        MIN_T[n] = up(1.2 * S * 2/3, n)   # compra de segunda dura terça + quarta = 2/3 de sábado
        MIN_S[n] = up(1.2 * S * 8/3, n)   # compra de quinta dura qui + sex + sáb + dom = 8/3 de sábado

# ---------------- ESTILOS ----------------
NAVY = PatternFill('solid', fgColor='1F3864')
INPUT = PatternFill('solid', fgColor='FFF2CC')
WARN = PatternFill('solid', fgColor='FFE699')
BAND = [PatternFill('solid', fgColor='DDEBF7'), PatternFill('solid', fgColor='FFFFFF')]
GRAY = PatternFill('solid', fgColor='F2F2F2')
thin = Side(style='thin', color='BFBFBF'); thick = Side(style='medium', color='1F3864')
B = Border(top=thin, bottom=thin, left=thin, right=thin)
WHITE_B = Font(bold=True, color='FFFFFF')
CENTER = Alignment(horizontal='center', vertical='center', wrap_text=True)
LEFT = Alignment(horizontal='left', vertical='center', wrap_text=True)
MID = Alignment(horizontal='center', vertical='center')
INT = '#,##0;[Red]-#,##0'; DEC = '#,##0.00;[Red]-#,##0.00'; HALF = '#,##0.0;[Red]-#,##0.0'
BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00'; PCT = '0%;[Red]-0%'

def header(ws, cols, widths, row=1):
    for j, (h, w) in enumerate(zip(cols, widths), start=1):
        c = ws.cell(row=row, column=j, value=h)
        c.font = WHITE_B; c.fill = NAVY; c.alignment = CENTER; c.border = B
        ws.column_dimensions[c.column_letter].width = w
    ws.row_dimensions[row].height = 34

def whole_dv(ws_, msg):
    d = DataValidation(type='whole', operator='greaterThanOrEqual', formula1='0', allow_blank=True,
                       showErrorMessage=True, errorTitle='Sem vírgula', error=msg)
    ws_.add_data_validation(d); return d

wb = Workbook()
HR = 5; E0 = HR + 1; EMAX = E0 + len(INS) - 1
ELIST = f'Estoque!$A${E0}:$A${EMAX}'

# ---------------- VENDAS ----------------
wv = wb.active; wv.title = 'Vendas'
for col, w in zip('ABCDE', [40, 6, 10, 12, 14]): wv.column_dimensions[col].width = w
wv.column_dimensions['F'].width = 3; wv.column_dimensions['G'].width = 14
for col, w in (('H', 3), ('I', 12), ('J', 38), ('K', 10)): wv.column_dimensions[col].width = w
wv.column_dimensions['I'].hidden = True
for col, h in (('G', 'Tem ficha?'), ('I', 'aux'), ('J', 'Produto'), ('K', 'Vendidos')):
    c = wv[f'{col}1']; c.value = h; c.font = WHITE_B; c.fill = NAVY; c.alignment = CENTER
VMAX = 500
A_, B_, D_ = 'INDEX($A:$A,ROW())', 'INDEX($B:$B,ROW())', 'INDEX($D:$D,ROW())'
for r in range(2, VMAX + 1):
    wv[f'I{r}'] = (f'=IF(OR(TRIM({A_})="",{B_}<>""),"",IFERROR(LEFT({A_},FIND(CHAR(1),'
                   f'SUBSTITUTE({A_},",""",CHAR(1),(LEN({A_})-LEN(SUBSTITUTE({A_},",""","")))/2))-1),""))')
    wv[f'J{r}'] = (f'=IF({B_}<>"",IF(TRIM({A_})="Produto","",TRIM({A_})),IF(I{r}="","",'
                   f'IFERROR(TRIM(SUBSTITUTE(LEFT(I{r},FIND(CHAR(1),SUBSTITUTE(I{r},",",CHAR(1),'
                   f'LEN(I{r})-LEN(SUBSTITUTE(I{r},",",""))-2))-1),"""","")),"")))')
    wv[f'K{r}'] = (f'=IF(J{r}="","",IF({B_}<>"",IF(ISNUMBER({D_}),{D_},IFERROR(VALUE(SUBSTITUTE({D_},".","")),0)),'
                   f'IF(I{r}="",0,IFERROR(VALUE(SUBSTITUTE(MID(I{r},FIND(CHAR(1),SUBSTITUTE(I{r},",",CHAR(1),'
                   f'LEN(I{r})-LEN(SUBSTITUTE(I{r},",",""))))+1,50),".","")),0))))')
    wv[f'G{r}'] = f'=IF(J{r}="","",IF(COUNTIF(Ficha!$A:$A,J{r})>0,"ok","SEM FICHA"))'
    wv[f'G{r}'].alignment = MID; wv[f'K{r}'].alignment = MID
    for col in 'JK': wv[f'{col}{r}'].font = Font(color='595959')
wv.conditional_formatting.add(f'G2:G{VMAX}', CellIsRule(operator='equal', formula=['"SEM FICHA"'],
    fill=PatternFill('solid', fgColor='F8CBAD'), font=Font(bold=True, color='9C0006')))
wv.conditional_formatting.add(f'G2:G{VMAX}', CellIsRule(operator='equal', formula=['"ok"'], font=Font(color='548235')))
if TEST_CSV and TEST_CSV.endswith('.txt'):
    for i, line in enumerate(open(TEST_CSV, encoding='utf-8'), start=1):
        wv.cell(row=i, column=1, value=line.split('\t')[0].rstrip('\n'))

FSTART = []
# ---------------- FICHA ----------------
ws = wb.create_sheet('Ficha')
header(ws, ['Produto', 'CMV', 'Preço de Venda', 'Lucro R$', 'Lucro %', 'Ingrediente', 'Custo ingrediente',
            'Quantidade', 'Medida', 'Vendidos', 'Consumo em Quantidade', 'Observação'],
       [30, 11, 11, 11, 9, 34, 11, 11, 9, 9, 13, 34])
VJ, VK = f'Vendas!$J$2:$J${VMAX}', f'Vendas!$K$2:$K${VMAX}'
def medida(rr):
    lk = f'VLOOKUP(F{rr},Estoque!$A:$C,3,FALSE)'
    return f'=IF(F{rr}="","",IF(F{rr}="{NOSTOCK}","—",IFERROR(IF({lk}="L","ml",{lk}),"item não existe no Estoque")))'
def custo(rr):
    pr = f'VLOOKUP(F{rr},Estoque!$A:$Q,17,FALSE)'
    md = f'VLOOKUP(F{rr},Estoque!$A:$C,3,FALSE)'
    qu = f'VLOOKUP(F{rr},Estoque!$A:$D,4,FALSE)'
    return (f'=IF(F{rr}="","",IF(F{rr}="{NOSTOCK}",0,IFERROR(IF({pr}="","",'
            f'H{rr}/IF({md}="L",1000,1)/{qu}*{pr}),"")))')
def fill_row(rr, band):
    for j in range(1, 13):
        c = ws.cell(rr, j); c.border = B; c.alignment = MID
        if band: c.fill = band
    ws.cell(rr, 6).alignment = LEFT; ws.cell(rr, 12).alignment = LEFT
    ws.cell(rr, 7).number_format = BRL; ws.cell(rr, 8).number_format = 'General'
    ws.cell(rr, 11).number_format = 'General'
r = 2
for k, (p, items) in enumerate(F):
    band = BAND[k % 2]; start = r
    for (ins, q, obs) in items:
        ws.cell(r, 6, ins); ws.cell(r, 7, custo(r)); ws.cell(r, 8, q); ws.cell(r, 9, medida(r))
        ws.cell(r, 11, f'=H{r}*$J${start}')
        ws.cell(r, 12, obs or None)
        fill_row(r, band)
        if obs.startswith('CONFIRMAR') or obs.startswith('Não apareceu'): ws.cell(r, 12).fill = WARN
        r += 1
    end = r - 1
    FSTART.append((p, start, end))
    ws.cell(start, 1, p)
    ws.cell(start, 2, f'=IF(COUNTIF(G{start}:G{end},"")>0,"falta preço",SUM(G{start}:G{end}))')
    ws.cell(start, 3, PRICE.get(p.upper()))
    ws.cell(start, 4, f'=IF(OR(C{start}="",NOT(ISNUMBER(B{start}))),"",C{start}-B{start})')
    ws.cell(start, 5, f'=IF(D{start}="","",IF(C{start}=0,"",D{start}/C{start}))')
    ws.cell(start, 10, f'=SUMIF({VJ},$A${start},{VK})')
    if end > start:
        for col in (1, 2, 3, 4, 5, 10):
            ws.merge_cells(start_row=start, end_row=end, start_column=col, end_column=col)
    ws.cell(start, 1).font = Font(bold=True); ws.cell(start, 1).alignment = LEFT
    ws.cell(start, 3).fill = INPUT
    for col, fmt in ((2, BRL), (3, BRL), (4, BRL), (5, PCT), (10, '#,##0')):
        ws.cell(start, col).number_format = fmt
    ws.cell(start, 2).font = Font(bold=True)
    for j in range(1, 13):
        ws.cell(start, j).border = Border(top=thick, bottom=thin, left=thin, right=thin)
SMAX = r - 1
ws.freeze_panes = 'B2'
dv = DataValidation(type='list', formula1=ELIST, allow_blank=True, showErrorMessage=False)
ws.add_data_validation(dv); dv.add(f'F2:F{SMAX+200}')
LAST = SMAX + 200
for rr in range(SMAX + 1, LAST + 1):
    nxt = f'IFERROR(MATCH("?*",A{rr+1}:A{LAST+1},0),{LAST}-{rr}+1)'
    ws.cell(rr, 2, f'=IF(A{rr}="","",IF(COUNTIF(OFFSET(G{rr},0,0,{nxt},1),"")>0,"falta preço",SUM(OFFSET(G{rr},0,0,{nxt},1))))')
    ws.cell(rr, 4, f'=IF(OR(A{rr}="",C{rr}="",NOT(ISNUMBER(B{rr}))),"",C{rr}-B{rr})')
    ws.cell(rr, 5, f'=IF(D{rr}="","",IF(C{rr}=0,"",D{rr}/C{rr}))')
    ws.cell(rr, 7, custo(rr)); ws.cell(rr, 9, medida(rr))
    ws.cell(rr, 10, f'=IF(A{rr}="","",SUMIF({VJ},A{rr},{VK}))')
    ws.cell(rr, 11, f'=IF(F{rr}="","",H{rr}*SUMIF({VJ},LOOKUP(2,1/($A$2:$A{rr}<>""),$A$2:$A{rr}),{VK}))')
    for j in range(1, 13): ws.cell(rr, j).alignment = MID
    ws.cell(rr, 1).alignment = LEFT; ws.cell(rr, 6).alignment = LEFT; ws.cell(rr, 12).alignment = LEFT
    for col, fmt in ((2, BRL), (3, BRL), (4, BRL), (5, PCT), (7, BRL)): ws.cell(rr, col).number_format = fmt
    ws.cell(rr, 3).fill = INPUT
ws.conditional_formatting.add(f'B2:B{LAST}', CellIsRule(operator='equal', formula=['"falta preço"'], font=Font(italic=True, color='9C0006')))

# ---------------- COMPRAS ----------------
wc = wb.create_sheet('Compras')
header(wc, ['Item', 'Embalagem', 'Unidades compradas / produzidas', 'Valor pago (R$)', 'Preço por unidade (R$)', 'Fornecedor / observação'],
       [36, 24, 13, 14, 14, 30])
dvw_c = whole_dv(wc, 'Esse item é comprado inteiro. Escreva sem vírgula.')
CMAX = len(INS) + 1; extra_end = CMAX + 30
for i in range(2, extra_end + 1):
    if i <= CMAX:
        n = INS[i - 2][0]; wc.cell(i, 1, n)
        wc.cell(i, 2, f'=IFERROR(VLOOKUP(A{i},Estoque!$A:$E,5,FALSE),"")')
        wc.cell(i, 3).number_format = HALF if n in FRAC else INT
        if n not in FRAC: dvw_c.add(f'C{i}')
    else:
        wc.cell(i, 2, f'=IF(A{i}="","",IFERROR(VLOOKUP(A{i},Estoque!$A:$E,5,FALSE),""))')
        wc.cell(i, 1).fill = INPUT; wc.cell(i, 3).number_format = 'General'
    wc.cell(i, 5, f'=IF(OR(C{i}="",C{i}=0,D{i}=""),"",D{i}/C{i})')
    for j in range(1, 7): wc.cell(i, j).border = B; wc.cell(i, j).alignment = MID
    wc.cell(i, 1).alignment = LEFT; wc.cell(i, 6).alignment = LEFT
    for j in (3, 4, 6): wc.cell(i, j).fill = INPUT
    wc.cell(i, 4).number_format = BRL; wc.cell(i, 5).number_format = BRL
    wc.cell(i, 2).font = Font(color='595959'); wc.cell(i, 5).font = Font(color='595959')
dvc = DataValidation(type='list', formula1=ELIST, allow_blank=True)
wc.add_data_validation(dvc); dvc.add(f'A{CMAX+1}:A{extra_end}')
t = extra_end + 1
wc.cell(t, 1, 'TOTAL DA COMPRA').font = Font(bold=True)
wc.cell(t, 4, f'=SUM(D2:D{extra_end})').number_format = BRL
wc.cell(t, 4).font = Font(bold=True); wc.cell(t, 4).alignment = MID
for j in range(1, 7): wc.cell(t, j).fill = PatternFill('solid', fgColor='D9E1F2'); wc.cell(t, j).border = B
wc.freeze_panes = 'A2'

# ---------------- FORNECEDORES ----------------
# (nome, como recebe, observação)
FORN = [
 ("Tomazoni", "Retirar no local", ""),
 ("NW", "", ""),
 ("Sanguiné", "", ""),
 ("Ambev", "", ""),
 ("Fensa (Coca-Cola)", "", ""),
 ("Desco", "", ""),
 ("Gabriel", "", "Fornecedor adicional da linha Red Bull"),
 ("Marcelo (importador)", "Entrega no bar", ""),
 ("GW", "", ""),
 ("Leandro (Bar Metz)", "", ""),
 ("Crestani (hortifruti)", "Encomenda (pedir antes)", ""),
 ("Ceasa", "Retirar", ""),
 ("Supermercado", "Retirar", ""),
 ("Zaffari", "Retirar", ""),
 ("Altas Horas", "Entrega no bar", ""),
 ("SOS Alimentos", "", ""),
 ("Vinícola De Cesaro", "", ""),
 ("Mercado Livre", "Compra online (pedir com antecedência)", "Demora alguns dias para chegar"),
 ("Produção própria", "Feito no bar", "Aparece na aba Produção, não na Lista de Compras"),
]
FNAMES = [f[0] for f in FORN]
T_, N_, S_, A_, F_, D_, G_, M_, GW_, L_ = ("Tomazoni", "NW", "Sanguiné", "Ambev", "Fensa (Coca-Cola)", "Desco",
                                           "Gabriel", "Marcelo (importador)", "GW", "Leandro (Bar Metz)")
CR, CE, SU, ZA, AH, SOS, VDC, ML, PP = ("Crestani (hortifruti)", "Ceasa", "Supermercado", "Zaffari", "Altas Horas",
                                        "SOS Alimentos", "Vinícola De Cesaro", "Mercado Livre", "Produção própria")
IFORN = {
 "Cachaça Ypióca Ouro": [S_, N_], "Cachaça Ypióca Branca": [S_, N_], "Cachaça Velho Barreiro": [T_],
 "Cachaça Kariri": [ML], "Vodka Smirnoff": [N_], "Vodka Absolut": [S_, N_, T_], "Whisky Passport": [N_],
 "Whisky White Horse": [N_], "Whisky Red Label": [N_], "Whisky Jack Daniel's": [T_],
 "Whisky Johnnie Walker Blonde": [N_], "Gin Gordon's": [N_], "Gin Tanqueray": [N_],
 "Infusão gin + hibisco + pimenta rosa": [PP], "Tequila Tequisla": [T_], "Tequila José Cuervo": [GW_],
 "Rum Montilla Ouro": [S_, N_], "Rum Montilla Prata": [S_, N_], "Fireball": [GW_], "Howler Head": [ZA],
 "Jägermeister": [M_], "Aperol": [N_, S_, T_], "Campari": [N_, S_, T_], "Vermute rosso": [N_, S_, T_],
 "Cynar": [ML], "Cointreau": [S_, N_], "Fernet": [M_], "Conhaque de alcatrão São João da Barra": [ML],
 "Angostura": [GW_], "Espumante brut Salton Séries": [S_, ZA], "Vinho tinto De Cesaro": [VDC],
 "Beats Green Mix LN 269ml": [A_, T_], "Beats GT LN 269ml": [A_, T_], "Beats Red Mix LN 269ml": [A_, T_],
 "Beats Senses LN 269ml": [A_, T_], "Beats Pink Lemonade LN 269ml": [A_, T_], "Brahma Chopp litrão 1L": [A_, T_],
 "Corona LN 330ml": [A_, T_], "Heineken 0,0% LN 330ml": [A_, T_], "Heineken 600ml": [T_],
 "Heineken lata 473ml": [T_], "Heineken LN 330ml": [T_], "Heineken Ultimate LN": [T_],
 "Original garrafa 1L": [A_, T_], "Original lata 473ml": [A_, T_], "Stella Artois LN 330ml": [A_, T_],
 "Stella Gold s/ glúten LN": [A_, T_], "Água com gás": [D_, T_], "Água sem gás": [D_, T_],
 "Coca-Cola lata 350ml": [F_, SU, T_], "Coca-Cola Zero lata 350ml": [F_, SU, T_], "Sprite lata 350ml": [F_, SU, T_],
 "Água tônica": [F_, SU, T_], "Baly tradicional": [T_], "Red Bull 250ml": [T_, S_, G_],
 "Red Bull Melancia 250ml": [T_, S_, G_], "Red Bull Tropical 250ml": [T_, S_, G_],
 "Monster Mango Loco 473ml": [F_, D_], "Monster Original 473ml": [F_, D_], "Monster Zero 473ml": [F_, D_],
 "Matito (drink pronto 1 L)": [L_], "Xarope de açúcar (simples)": [PP], "Xarope de mel": [PP],
 "Xarope de gengibre": [PP], "Xarope de cranberry Monin": [ZA, N_], "Suco de maracujá concentrado": [ZA],
 "Espuma cítrica de gengibre": [PP], "Limão Taiti": [CE, CR, SU], "Limão Siciliano": [CE],
 "Laranja": [CE, CR, SU], "Manjericão": [CE, ZA], "Hortelã": [CE, ZA], "Pimenta rosa": [CE, SU, D_, ZA],
 "Ovo": [CE, CR, D_, ZA], "Copo descartável 400ml": [AH, T_], "Copo descartável 700ml": [AH, T_],
 "Batata congelada para fritar": [SOS], "Seda": [T_],
}
for _n in CONT: assert _n in IFORN, ('sem fornecedor no mapa', _n)
for _l in IFORN.values():
    for _f in _l: assert _f in FNAMES, _f
NF = len(FORN); FL = 'Fornecedores!$A$2:$A$40'

# ---------------- ESTOQUE ----------------
we = wb.create_sheet('Estoque')
cols = ['Item', 'Tipo', 'Medida', 'Quantidade por Unidade', 'Embalagem', 'Estoque Início',
        'Compra/Produção', 'Consumo em Quantidade', 'Consumo em Unidade', 'Estoque Atual',
        'Estoque Mínimo Segunda (dura terça e quarta)', 'Estoque Mínimo Quinta (dura quinta a domingo)', 'Situação', 'Sugestão de Compra',
        'Estoque Esperado (semana passada)', 'Perda / Sobra da semana', 'Preço da Unidade (R$)', 'Fornecedor principal', 'Outros fornecedores', 'aux', 'aux2', 'aux3']
header(we, cols, [36, 18, 8, 11, 24, 10, 11, 12, 11, 10, 15, 15, 13, 11, 10, 10, 12, 22, 34, 6, 6, 6], row=HR)
we.column_dimensions['T'].hidden = True; we.column_dimensions['U'].hidden = True; we.column_dimensions['V'].hidden = True
for _k, _c in enumerate(['W', 'X', 'Y', 'Z', 'AA', 'AB']):
    we[f'{_c}{HR}'] = 'consumo ' + DIAS6[_k]; we.column_dimensions[_c].hidden = True
dvf = DataValidation(type='list', formula1=FL, allow_blank=True)
we.add_data_validation(dvf)
we.row_dimensions[HR].height = 48
we.merge_cells('A1:C1'); we['A1'] = 'SUGESTÃO DE COMPRA'
we['A3'] = 'Folga de segurança'; we['A3'].font = Font(bold=True); we['A3'].alignment = Alignment(horizontal='left', vertical='center')
we['B3'] = 0.2; we['B3'].number_format = '0%'; we['B3'].fill = INPUT; we['B3'].alignment = Alignment(horizontal='center', vertical='center'); we['B3'].border = B
we['A2'] = 'Dia da compra'; we['A2'].font = Font(bold=True); we['A2'].alignment = LEFT
c = we['B2']; c.fill = INPUT; c.alignment = MID; c.border = B; c.font = Font(bold=True, size=12)
dvd = DataValidation(type='list', formula1='"Segunda,Quinta"', allow_blank=True)
we.add_data_validation(dvd); dvd.add('B2')
we['C2'] = '=IF(B2="","← escolha Segunda ou Quinta","")'
we['C2'].font = Font(color='595959', italic=True); we['C2'].alignment = LEFT
we.merge_cells('E1:S1'); we['E1'] = 'QUANDO COMPRAR'
we.merge_cells('E2:S2'); we['E2'] = 'SEGUNDA (bar fechado): contar o estoque e comprar o que precisa para terça e quarta.'
we.merge_cells('E3:S3'); we['E3'] = 'QUINTA (antes de abrir): colar as vendas de terça e quarta e comprar o que precisa para quinta, sexta, sábado e domingo.'
for cc in ('A1', 'E1'): we[cc].font = WHITE_B; we[cc].fill = NAVY; we[cc].alignment = MID
for cc in ('E2', 'E3'): we[cc].fill = GRAY; we[cc].alignment = LEFT
we.row_dimensions[4].height = 8
dvw_e = whole_dv(we, 'Esse item é contado em unidades inteiras. Escreva sem vírgula.')
for idx, (n, cat, un, emb, cont) in enumerate(INS):
    i = E0 + idx
    isL = (un == 'ml'); nonalc = (cat == 'Não alcoólicos')
    med = 'L' if isL else un
    q = cont / 1000 if isL else cont
    par = f'IF($B$2="Segunda",K{i},L{i})'
    raw = f'MAX(0,{par}-J{i})'
    if n in FRAC: sug = f'ROUNDUP({raw}*2,0)/2'
    elif ALCO(n): sug = f'ROUND({raw},0)'
    else: sug = f'ROUNDUP({raw},0)'
    vals = [n, cat, med, q, emb, None,
            f'=SUMIF(Compras!$A:$A,A{i},Compras!$C:$C)',
            f'=SUMIF(Ficha!$F:$F,A{i},Ficha!$K:$K)/IF(C{i}="L",1000,1)',
            (f'=IF(D{i}>0,ROUNDUP(H{i}/D{i},0),0)' if nonalc else f'=IF(D{i}>0,H{i}/D{i},0)'),
            f'=F{i}+G{i}-I{i}',
            f'=MAX({0.5 if n in FRAC else 1},ROUNDUP((W{i}+X{i})*(1+$B$3)*{2 if n in FRAC else 1},0)/{2 if n in FRAC else 1})',
            f'=MAX({0.5 if n in FRAC else 1},ROUNDUP((Y{i}+Z{i}+AA{i}+AB{i})*(1+$B$3)*{2 if n in FRAC else 1},0)/{2 if n in FRAC else 1})',
            f'=IF(J{i}<=0,"SEM ESTOQUE",IF(N{i}="",IF(J{i}<K{i},"COMPRAR","OK"),IF(N{i}>0,"COMPRAR","OK")))',
            f'=IF($B$2="","",{sug})',
            None,
            f'=IF(OR(O{i}="",F{i}=""),"",F{i}-O{i})',
            None,
            (IFORN[n][0] if IFORN[n] else None),
            ('; '.join(IFORN[n][1:]) if len(IFORN[n]) > 1 else ('—' if IFORN[n] else 'definir fornecedor')),
            f'=IF(AND(ISNUMBER(N{i}),N{i}>0,R{i}<>"{PP}"),IFERROR(MATCH(R{i},{FL},0),99)*1000+ROW(),"")',
            f'=IF(T{i}="","",N{i}*IF(ISNUMBER(Q{i}),Q{i},0))',
            f'=IF(AND(ISNUMBER(N{i}),N{i}>0,R{i}="{PP}"),ROW(),"")']
    for j, v in enumerate(vals, start=1):
        cc = we.cell(i, j, v); cc.border = B; cc.alignment = MID
    we.cell(i, 1).alignment = LEFT
    for j in (4, 6, 15, 17): we.cell(i, j).fill = INPUT
    for k6 in range(6):
        col = 23 + k6
        we.cell(i, col, f"=IF({DAYS(k6)}=0,{round(SAT[n] * PESO[k6], 4)},SUMIF(Ficha!$F:$F,$A{i},Ficha!{'MNOPQR'[k6]}:{'MNOPQR'[k6]})/IF($C{i}=\"L\",1000,1)/$D{i})")
    we.cell(i, 10).font = Font(bold=True); we.cell(i, 14).font = Font(bold=True, color='1F3864')
    ff = HALF if n in FRAC else (INT if INTCAT(n) else DEC)          # Estoque Início
    we.cell(i, 6).number_format = ff
    if INTCAT(n) or n in FRAC: pass
    if INTCAT(n): dvw_e.add(f'F{i}')
    stock = INT if nonalc else DEC
    for j in (9, 10, 15, 16): we.cell(i, j).number_format = stock
    buy = HALF if n in FRAC else INT
    for j in (7, 11, 12, 14): we.cell(i, j).number_format = buy
    we.cell(i, 4).number_format = 'General'; we.cell(i, 8).number_format = 'General'
    we.cell(i, 17).number_format = BRL
    we.cell(i, 18).fill = INPUT; dvf.add(f'R{i}')
    we.cell(i, 18).alignment = LEFT; we.cell(i, 19).alignment = LEFT; we.cell(i, 19).font = Font(color='595959')
we.conditional_formatting.add(f'M{E0}:M{EMAX}', CellIsRule(operator='equal', formula=['"COMPRAR"'], fill=PatternFill('solid', fgColor='FFE699'), font=Font(bold=True, color='7F6000')))
we.conditional_formatting.add(f'M{E0}:M{EMAX}', CellIsRule(operator='equal', formula=['"SEM ESTOQUE"'], fill=PatternFill('solid', fgColor='F8CBAD'), font=Font(bold=True, color='9C0006')))
we.conditional_formatting.add(f'M{E0}:M{EMAX}', CellIsRule(operator='equal', formula=['"OK"'], font=Font(color='548235')))
we.freeze_panes = f'B{E0}'; we.auto_filter.ref = f'A{HR}:S{EMAX}'
for cc in ('E1','E2','E3'): pass

# ---------------- LISTA DE COMPRAS (automática, separada por fornecedor) ----------------
wl = wb.create_sheet('Lista de Compras')
wl.sheet_properties.tabColor = '70AD47'
wl.merge_cells('A1:G1'); wl['A1'] = 'LISTA DE COMPRAS (sai sozinha da Sugestão de Compra)'
wl['A1'].font = Font(bold=True, color='FFFFFF', size=13); wl['A1'].fill = NAVY; wl['A1'].alignment = MID
wl['A2'] = 'Dia da compra:'; wl['A2'].font = Font(bold=True); wl['A2'].alignment = LEFT
wl['B2'] = '=IF(Estoque!B2="","escolha na aba Estoque",Estoque!B2)'; wl['B2'].font = Font(bold=True, size=12)
wl['D2'] = 'Total estimado:'; wl['D2'].font = Font(bold=True); wl['D2'].alignment = Alignment(horizontal='right')
ROWS = len(INS)
L0 = 5
wl['E2'] = f'=SUM(F{L0}:F{L0 + ROWS - 1})'; wl['E2'].number_format = BRL; wl['E2'].font = Font(bold=True, size=12)
header(wl, ['Fornecedor', 'Como recebe', 'Item', 'Comprar', 'Embalagem', 'Valor estimado (R$)', 'Comprado ✔',
            'aux', 'aux2', 'aux3'], [24, 26, 36, 10, 24, 14, 11, 6, 6, 6], row=4)
for col in 'HIJ': wl.column_dimensions[col].hidden = True
for k in range(1, ROWS + 1):
    r = L0 + k - 1
    wl.cell(r, 8, f'=IFERROR(SMALL(Estoque!$T${E0}:$T${EMAX},{k}),"")')            # chave
    wl.cell(r, 9, f'=IF(H{r}="","",MOD(H{r},1000))')                                # linha do Estoque
    wl.cell(r, 10, f'=IF(I{r}="","",IF(INDEX(Estoque!$R:$R,I{r})="","Sem fornecedor",INDEX(Estoque!$R:$R,I{r})))')
    prev = f'J{r-1}' if k > 1 else '""'
    wl.cell(r, 1, f'=IF(J{r}="","",IF(J{r}={prev},"",J{r}))')
    wl.cell(r, 2, f'=IF(A{r}="","",IFERROR(VLOOKUP(J{r},Fornecedores!$A:$B,2,FALSE)&"",""))')
    wl.cell(r, 3, f'=IF(I{r}="","",INDEX(Estoque!$A:$A,I{r}))')
    wl.cell(r, 4, f'=IF(I{r}="","",INDEX(Estoque!$N:$N,I{r}))')
    wl.cell(r, 5, f'=IF(I{r}="","",INDEX(Estoque!$E:$E,I{r}))')
    wl.cell(r, 6, f'=IF(I{r}="","",INDEX(Estoque!$U:$U,I{r}))')
    for j in range(1, 8):
        c = wl.cell(r, j); c.alignment = MID
    wl.cell(r, 1).alignment = LEFT; wl.cell(r, 3).alignment = LEFT
    wl.cell(r, 1).font = Font(bold=True, color='1F3864'); wl.cell(r, 4).font = Font(bold=True)
    wl.cell(r, 4).number_format = 'General'; wl.cell(r, 6).number_format = BRL
    wl.cell(r, 7).fill = INPUT
# linha de separação quando muda o fornecedor
wl.conditional_formatting.add(f'A{L0}:G{L0 + ROWS - 1}', FormulaRule(formula=[f'$A{L0}<>""'],
    border=Border(top=Side(style='medium', color='1F3864')), fill=PatternFill('solid', fgColor='DDEBF7')))
wl.conditional_formatting.add(f'A{L0}:G{L0 + ROWS - 1}', FormulaRule(formula=[f'AND($C{L0}<>"",$G{L0}<>"")'],
    font=Font(color='808080', strike=True)))
wl.freeze_panes = f'A{L0}'

# ---------------- FORNECEDORES ----------------
wf = wb.create_sheet('Fornecedores')
header(wf, ['Fornecedor', 'Como recebe', 'Contato (telefone / WhatsApp)', 'Observação', 'Itens para comprar',
            'Valor estimado (R$)', 'Mensagem do pedido (copiar e mandar)'], [24, 30, 24, 34, 11, 14, 90])
for i in range(2, 41):
    nm, como, obs = FORN[i - 2] if i - 2 < NF else (None, None, None)
    wf.cell(i, 1, nm); wf.cell(i, 2, como or None); wf.cell(i, 4, obs or None)
    if nm is None: wf.cell(i, 1).fill = INPUT
    wf.cell(i, 5, f'=IF(A{i}="","",COUNTIFS(Estoque!$R${E0}:$R${EMAX},A{i},Estoque!$T${E0}:$T${EMAX},">0"))')
    wf.cell(i, 6, f'=IF(A{i}="","",SUMIF(Estoque!$R${E0}:$R${EMAX},A{i},Estoque!$U${E0}:$U${EMAX}))')
    ref = f'G{i}'
    wf[ref] = ArrayFormula(ref, f'=IF(OR(A{i}="",A{i}="{PP}",E{i}=0),"","Olá! Pedido do Mukifo: "&_xlfn.TEXTJOIN(", ",TRUE,'
                               f'IF((Estoque!$R${E0}:$R${EMAX}=A{i})*(Estoque!$T${E0}:$T${EMAX}<>""),'
                               f'Estoque!$N${E0}:$N${EMAX}&" x "&Estoque!$A${E0}:$A${EMAX},""))&". Obrigado!")')
    for j in range(1, 8):
        c = wf.cell(i, j); c.border = B; c.alignment = MID
    for j in (1, 2, 4, 7): wf.cell(i, j).alignment = LEFT
    wf.cell(i, 1).font = Font(bold=True)
    for j in (2, 3, 4): wf.cell(i, j).fill = INPUT
    wf.cell(i, 6).number_format = BRL
wf.conditional_formatting.add('A2:G40', FormulaRule(formula=['AND(ISNUMBER($E2),$E2>0)'], fill=PatternFill('solid', fgColor='E2EFDA')))
wf.freeze_panes = 'B2'
# ---------------- PRODUÇÃO (separada das compras) ----------------
wp = wb.create_sheet('Produção')
wp.sheet_properties.tabColor = 'ED7D31'
wp.merge_cells('A1:E1'); wp['A1'] = 'PRODUÇÃO DO BAR (o que fazer, não comprar)'
wp['A1'].font = Font(bold=True, color='FFFFFF', size=13); wp['A1'].fill = NAVY; wp['A1'].alignment = MID
# --- gelo ---
wp.merge_cells('A3:E3'); wp['A3'] = 'GELO DA MÁQUINA: guardar para o fim de semana'
wp['A3'].font = WHITE_B; wp['A3'].fill = PatternFill('solid', fgColor='ED7D31'); wp['A3'].alignment = MID
for j, h in enumerate(['Dia', 'Sacos de 5 L', 'Feito ✔'], start=1):
    c = wp.cell(4, j, h); c.font = WHITE_B; c.fill = NAVY; c.alignment = CENTER; c.border = B
for k, d in enumerate(['Quarta', 'Quinta', 'Sexta'], start=5):
    wp.cell(k, 1, d); wp.cell(k, 2, 4); wp.cell(k, 3)
    for j in (1, 2, 3):
        c = wp.cell(k, j); c.border = B; c.alignment = MID
    wp.cell(k, 2).fill = INPUT; wp.cell(k, 3).fill = INPUT; wp.cell(k, 1).font = Font(bold=True)
wp.cell(8, 1, 'Total para o fim de semana').font = Font(bold=True)
wp.cell(8, 2, '=SUM(B5:B7)').font = Font(bold=True, size=12)
wp.cell(8, 3, '=B8*5&" litros"')
for j in (1, 2, 3):
    c = wp.cell(8, j); c.fill = PatternFill('solid', fgColor='D9E1F2'); c.border = B; c.alignment = MID
wp.cell(8, 1).alignment = LEFT
wp.cell(9, 1, 'Ensacar e guardar no freezer. Na segunda, apague os X da coluna "Feito ✔".').font = Font(italic=True, color='595959')
# --- preparos ---
P0 = 13
wp.merge_cells(f'A{P0-2}:E{P0-2}'); wp[f'A{P0-2}'] = 'XAROPES E PREPAROS (sai sozinho da Sugestão de Compra)'
wp[f'A{P0-2}'].font = WHITE_B; wp[f'A{P0-2}'].fill = PatternFill('solid', fgColor='ED7D31'); wp[f'A{P0-2}'].alignment = MID
header(wp, ['Item', 'Produzir', 'Medida', 'Feito ✔', 'Dia da compra', 'aux', 'aux2'], [36, 12, 14, 10, 16, 6, 6], row=P0 - 1)
wp.column_dimensions['F'].hidden = True; wp.column_dimensions['G'].hidden = True
NPROD = sum(1 for n in CONT if IFORN.get(n) and IFORN[n][0] == PP) + 6
for k in range(1, NPROD + 1):
    r = P0 + k - 1
    wp.cell(r, 6, f'=IFERROR(SMALL(Estoque!$V${E0}:$V${EMAX},{k}),"")')
    wp.cell(r, 1, f'=IF(F{r}="","",INDEX(Estoque!$A:$A,F{r}))')
    wp.cell(r, 2, f'=IF(F{r}="","",INDEX(Estoque!$N:$N,F{r}))')
    wp.cell(r, 3, f'=IF(F{r}="","",IF(INDEX(Estoque!$C:$C,F{r})="L","litros",INDEX(Estoque!$C:$C,F{r})))')
    wp.cell(r, 5, f'=IF(F{r}="","",Estoque!$B$2)')
    for j in range(1, 6):
        c = wp.cell(r, j); c.alignment = MID; c.border = B
    wp.cell(r, 1).alignment = LEFT; wp.cell(r, 2).font = Font(bold=True); wp.cell(r, 4).fill = INPUT
wp.cell(P0 + NPROD + 1, 1, 'O que for produzido entra no estoque: escreva a quantidade na aba Compras, coluna "Unidades compradas / produzidas".').font = Font(italic=True, color='595959')
wp.column_dimensions['A'].width = 36

# ================= HISTÓRICO (últimos 30 dias) / MÉDIA POR DIA / IMPRESSÕES =================
DIAS6 = ['Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
WD = [3, 4, 5, 6, 7, 1]                      # WEEKDAY() de cada um
PESO = [1/3, 1/3, 1/3, 1, 1, 1/3]            # venda do dia em "sábados"
HMAX = 3001

# ---------- Histórico ----------
wh = wb.create_sheet('Histórico 30 dias')
wh.sheet_properties.tabColor = '7030A0'
for col, h, w in (('A', 'Data', 13), ('B', 'Relatório do dia (cole aqui, na coluna B)', 46)):
    c = wh[f'{col}1']; c.value = h; c.font = WHITE_B; c.fill = NAVY; c.alignment = CENTER
    wh.column_dimensions[col].width = w
for col, w in zip('CDEF', (6, 10, 10, 12)): wh.column_dimensions[col].width = w
wh['G1'] = 'Fora da média? (motivo)'; wh['G1'].font = WHITE_B; wh['G1'].fill = NAVY; wh['G1'].alignment = CENTER
wh.column_dimensions['G'].width = 34; wh.column_dimensions['H'].width = 3
wh['I1'] = 'Dias usados na média'; wh['I1'].font = WHITE_B; wh['I1'].fill = NAVY; wh['I1'].alignment = CENTER
wh.merge_cells('I1:J1'); wh.column_dimensions['I'].width = 12; wh.column_dimensions['J'].width = 8
for k, (d, w) in enumerate(zip(DIAS6, WD), start=2):
    wh.cell(k, 9, d).alignment = LEFT
    wh.cell(k, 10, f'=SUMPRODUCT((A$2:A${HMAX}<>"")*(G$2:G${HMAX}="")*(WEEKDAY(A$2:A${HMAX})={w}))').alignment = MID
    for j in (9, 10): wh.cell(k, j).border = B
wh['I8'] = 'Total'; wh['J8'] = '=SUM(J2:J7)'
for cc in ('I8', 'J8'): wh[cc].font = Font(bold=True); wh[cc].border = B
wh['J8'].alignment = MID
tips = ['COMO COLAR OS 30 DIAS',
        '1. Tire o relatório de vendas de UM dia no sistema.',
        '2. Cole na coluna B, na primeira linha vazia (com o cabeçalho).',
        '3. Na coluna A, escreva a data SÓ na linha do cabeçalho daquele dia.',
        '4. Repita para cada dia, um embaixo do outro.',
        '5. Se o dia foi fora do normal (feriado, véspera, chuva forte, evento), escreva o motivo na coluna G, na linha da data. Ele fica fora da média.',
        'Segundas (só almoço) ficam marcadas como fora.',
        'A aba "Média por Dia" calcula sozinha a venda média de cada dia da semana.']
for k, t in enumerate(tips, start=10):
    c = wh.cell(k, 9, t); c.alignment = Alignment(vertical='top')
    if k == 10: c.font = WHITE_B; c.fill = NAVY
    else: c.fill = GRAY
for col in 'QRSTUV': wh.column_dimensions[col].hidden = True
RA, RB, RE = 'INDEX($B:$B,ROW())', 'INDEX($C:$C,ROW())', 'INDEX($E:$E,ROW())'
for r in range(2, HMAX + 1):
    wh[f'A{r}'].fill = INPUT; wh[f'A{r}'].number_format = 'DD/MM/YYYY'
    wh[f'Q{r}'] = f'=IF(A{r}<>"",A{r},' + ('""' if r == 2 else f'Q{r-1}') + ')'
    wh[f'R{r}'] = (f'=IF(OR(TRIM({RA})="",{RB}<>""),"",IFERROR(LEFT({RA},FIND(CHAR(1),'
                   f'SUBSTITUTE({RA},",""",CHAR(1),(LEN({RA})-LEN(SUBSTITUTE({RA},",""","")))/2))-1),""))')
    wh[f'S{r}'] = (f'=IF({RB}<>"",IF(TRIM({RA})="Produto","",TRIM({RA})),IF(R{r}="","",'
                   f'IFERROR(TRIM(SUBSTITUTE(LEFT(R{r},FIND(CHAR(1),SUBSTITUTE(R{r},",",CHAR(1),'
                   f'LEN(R{r})-LEN(SUBSTITUTE(R{r},",",""))-2))-1),"""","")),"")))')
    wh[f'T{r}'] = (f'=IF(S{r}="","",IF({RB}<>"",IF(ISNUMBER({RE}),{RE},IFERROR(VALUE(SUBSTITUTE({RE},".","")),0)),'
                   f'IF(R{r}="",0,IFERROR(VALUE(SUBSTITUTE(MID(R{r},FIND(CHAR(1),SUBSTITUTE(R{r},",",CHAR(1),'
                   f'LEN(R{r})-LEN(SUBSTITUTE(R{r},",",""))))+1,50),".","")),0))))')
    wh[f'V{r}'] = f'=IF(A{r}<>"",G{r}<>"",' + ('FALSE' if r == 2 else f'V{r-1}') + ')'
    wh[f'U{r}'] = f'=IF(OR(Q{r}="",S{r}="",V{r}),"",WEEKDAY(Q{r}))'
wh.freeze_panes = 'A2'
# ---- histórico real já carregado ----
import glob as _g, json as _j, datetime as _dt
_HD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dados', 'historico')
_fora = _j.load(open(os.path.join(_HD, 'fora_da_media.json'), encoding='utf-8'))
_arqs = []
for _f in _g.glob(os.path.join(_HD, '*.csv')):
    _d, _m = os.path.basename(_f)[:-4].split('-'); _arqs.append((_dt.datetime(2026, int(_m), int(_d)), _f))
_r = 2
for _dia, _f in sorted(_arqs):
    _lin = [l.rstrip('\n') for l in open(_f, encoding='utf-8') if l.strip()]
    wh.cell(_r, 1, _dia); _mot = _fora.get(_dia.date().isoformat(), '')
    if _mot: wh.cell(_r, 7, _mot)
    for _l in _lin:
        wh.cell(_r, 2, _l); _r += 1
for _rr in range(2, _r):
    if wh.cell(_rr, 7).value:
        for _j2 in (1, 7): wh.cell(_rr, _j2).fill = PatternFill('solid', fgColor='FCE4D6')
DAYS = lambda k: f"'Histórico 30 dias'!$J${k + 2}"

# ---------- Média por Dia ----------
wm = wb.create_sheet('Média por Dia')
wm.sheet_properties.tabColor = '7030A0'
header(wm, ['Produto'] + DIAS6, [36, 10, 10, 10, 10, 10, 10])
PRODS = []
for p, _ in F:
    if p not in PRODS: PRODS.append(p)
for i, p in enumerate(PRODS, start=2):
    wm.cell(i, 1, p).alignment = LEFT
    for k, w in enumerate(WD):
        wm.cell(i, 2 + k, f"=IF({DAYS(k)}=0,\"\",SUMIFS('Histórico 30 dias'!$T$2:$T${HMAX},"
                          f"'Histórico 30 dias'!$S$2:$S${HMAX},$A{i},'Histórico 30 dias'!$U$2:$U${HMAX},{w})/{DAYS(k)})")
        wm.cell(i, 2 + k).number_format = '0.0'; wm.cell(i, 2 + k).alignment = MID
    for j in range(1, 8): wm.cell(i, j).border = B
wm.cell(len(PRODS) + 3, 1, 'Média de unidades vendidas por dia. Fica vazio até colar dias na aba "Histórico 30 dias".').font = Font(italic=True, color='595959')
wm.freeze_panes = 'B2'

# ---------- Ficha: consumo médio por dia (colunas ocultas M:R) ----------
for (p, s0, e0) in FSTART:
    for r in range(s0, e0 + 1):
        for k in range(6):
            ws.cell(r, 13 + k, f"=IFERROR(H{r}*INDEX('Média por Dia'!$B:$G,MATCH($A${s0},'Média por Dia'!$A:$A,0),{k + 1}),0)")
for col in 'MNOPQR': ws.column_dimensions[col].hidden = True

# ---------- IMPRESSÕES ----------
wi = wb.create_sheet('IMPRESSÕES')
wi.sheet_properties.tabColor = 'C00000'
for col, w in zip('ABCDE', (34, 15, 15, 15, 17)): wi.column_dimensions[col].width = w
wi.merge_cells('A1:E1'); wi['A1'] = 'MUKIFO  •  CONTROLE DIÁRIO DE PRODUÇÃO'
wi['A1'].font = Font(bold=True, size=15, color='FFFFFF'); wi['A1'].fill = NAVY; wi['A1'].alignment = MID
wi.row_dimensions[1].height = 30
wi['A2'] = 'Dia do movimento:'; wi['A2'].font = Font(bold=True, size=12); wi['A2'].alignment = LEFT
c = wi['B2']; c.fill = INPUT; c.font = Font(bold=True, size=13); c.alignment = MID; c.border = B
dvi = DataValidation(type='list', formula1='"' + ','.join(DIAS6) + '"', allow_blank=True)
wi.add_data_validation(dvi); dvi.add('B2')
wi['C2'] = 'Data: ___/___'; wi['C2'].alignment = Alignment(horizontal='left', vertical='center')
wi.merge_cells('D2:E2'); wi['D2'] = 'Responsável: ______________'; wi['D2'].alignment = Alignment(horizontal='left', vertical='center')
IDX = 'MATCH($B$2,{"' + '","'.join(DIAS6) + '"},0)'
wi.merge_cells('A3:E3')
wi['A3'] = (f'=IF($B$2="","← escolha o dia",IF(INDEX(\'Histórico 30 dias\'!$J$2:$J$7,{IDX})>0,'
            f'"Produção calculada pela média de "&INDEX(\'Histórico 30 dias\'!$J$2:$J$7,{IDX})&" "&LOWER($B$2)&"(s) colada(s) no Histórico, com 20% de folga.",'
            f'"Ainda sem histórico de "&LOWER($B$2)&": usando a venda de referência, com 20% de folga."))')
wi['A3'].font = Font(italic=True, color='595959', size=9); wi['A3'].alignment = LEFT
header(wi, ['Item', 'Medida', 'Início do Movimento', 'Produção do dia', 'Final do Movimento'],
       [34, 15, 15, 15, 17], row=5)
for col, h in zip('HIJKLMN', DIAS6 + ['dia escolhido']): wi[f'{col}5'] = h
for col in 'HIJKLMN': wi.column_dimensions[col].hidden = True
PROD_L = [("Xarope de açúcar (simples)", "Xarope de açúcar", "litros", 1/1000, 'L'),
          ("Xarope de mel", "Xarope de mel", "litros", 1/1000, 'L'),
          ("Xarope de gengibre", "Xarope de gengibre", "litros", 1/1000, 'L'),
          ("Infusão gin + hibisco + pimenta rosa", "Infusão de gin, hibisco e pimenta rosa", "litros", 1/1000, 'L'),
          ("Espuma cítrica de gengibre", "Espuma cítrica de gengibre", "talagaços", 1, 'U')]
ADI = [("Limão Taiti", "Limão Taiti cortado (caipirinhas e drinks)", "limões", 10, 'U'),
       ("Limão Siciliano", "Limão siciliano cortado", "limões", 1/0.15, 'U'),
       ("Laranja", "Laranja fatiada (Jagerbomb)", "fatias", 8, 'U')]
HORT = [("Hortelã", "Hortelã", "maços", 1, 'U'), ("Manjericão", "Manjericão", "maços", 1, 'U'),
        ("Ovo", "Ovos (claras do Whisky Sour)", "unidades", 1, 'U')]
r = 6
def secao(titulo):
    global r
    wi.merge_cells(start_row=r, end_row=r, start_column=1, end_column=5)
    c = wi.cell(r, 1, titulo); c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='ED7D31')
    c.alignment = LEFT; r += 1
def linha(base, nome, medida, conv, step):
    global r
    wi.cell(r, 1, nome); wi.cell(r, 2, medida)
    for k in range(6):
        ref = _use.get(base, 0) * PESO[k] * conv
        wi.cell(r, 8 + k, f"=IF({DAYS(k)}>0,SUMIF(Ficha!$F:$F,\"{base}\",Ficha!{'MNOPQR'[k]}:{'MNOPQR'[k]})*{conv},{round(ref, 4)})")
    wi.cell(r, 14, f'=IF($B$2="","",INDEX(H{r}:M{r},{IDX}))')
    x = f'MAX(0,N{r}*1.2-IF(ISNUMBER(C{r}),C{r},0))'
    rnd = f'ROUNDUP({x}*2,0)/2' if step == 'L' else f'ROUNDUP({x},0)'
    wi.cell(r, 4, f'=IF($B$2="","",{rnd})')
    estilo(r); r += 1
def estilo(rr):
    for j in range(1, 6):
        c = wi.cell(rr, j); c.border = Border(top=thin, bottom=Side(style='thin', color='808080'), left=thin, right=thin)
        c.alignment = MID
    wi.cell(rr, 1).alignment = LEFT; wi.cell(rr, 3).fill = INPUT
    wi.cell(rr, 4).font = Font(bold=True, size=12); wi.cell(rr, 4).number_format = 'General'
    wi.row_dimensions[rr].height = 24
secao('PRODUÇÕES DA CASA')
for t in PROD_L: linha(*t)
secao('GELO (máquina)')
wi.cell(r, 1, 'Gelo ensacado'); wi.cell(r, 2, 'sacos de 5 L')
wi.cell(r, 4, '=IF($B$2="","",IFERROR(VLOOKUP($B$2,Produção!$A$5:$B$7,2,FALSE),0))')
estilo(r); r += 1
secao('ADIANTAMENTOS (cortes para o horário de pico)')
for t in ADI: linha(*t)
secao('HORTIFRUTI (conferir e separar)')
for t in HORT: linha(*t)
LASTI = r - 1
r += 1
notas_i = ['COMO USAR ESTA FOLHA',
           '1. No FECHAMENTO, a equipe conta cada item e escreve na coluna "Final do Movimento" (no papel).',
           '2. No dia seguinte, a proprietária digita esses números em "Início do Movimento" e escolhe o dia acima.',
           '3. A coluna "Produção do dia" mostra o que preparar antes de abrir. Imprima e entregue para a equipe.',
           'Gelo segue o plano da aba Produção (quarta, quinta e sexta: 4 sacos de 5 L cada).']
for k, t in enumerate(notas_i):
    wi.merge_cells(start_row=r + k, end_row=r + k, start_column=1, end_column=5)
    c = wi.cell(r + k, 1, t); c.alignment = LEFT
    c.font = Font(bold=True) if k == 0 else Font(size=9, color='404040')
PRINT_END = r + len(notas_i) - 1
wi.print_area = f'A1:E{PRINT_END}'
wi.page_setup.orientation = 'portrait'; wi.page_setup.paperSize = wi.PAPERSIZE_A4
wi.page_setup.fitToWidth = 1; wi.page_setup.fitToHeight = 1
wi.sheet_properties.pageSetUpPr.fitToPage = True
wi.print_options.horizontalCentered = True
wi.page_margins.left = wi.page_margins.right = 0.4; wi.page_margins.top = wi.page_margins.bottom = 0.5
nf_end = 42
wf.cell(nf_end, 1, 'Fornecedor novo: escreva o nome na primeira linha amarela vazia. Ele já aparece na lista de fornecedores da aba Estoque.').font = Font(italic=True, color='595959')

H = "§"
notes = [H+"PALAVRAS DA PLANILHA (volte aqui sempre que ficar em dúvida)",
 "• QUANTIDADE = o quanto se usa. Na aba Ficha (receitas) está em ml, g, kg ou un. Na aba Estoque, as bebidas estão em LITROS (L). 1 L = 1000 ml. Exemplo: 50 ml de vodka = 0,05 L.",
 "• UNIDADE = quantas garrafas, latas, pacotes, maços ou kg. Exemplo: 3 garrafas de vodka.",
 "• QUANTIDADE POR UNIDADE = quanto vem em 1 unidade. Exemplo: 1 garrafa de Smirnoff tem 0,998 L (998 ml).",
 "• MEDIDA = como a quantidade é medida: L (litro), ml, g, kg, un (unidade inteira), maço ou talagaço.",
 "• EMBALAGEM = como o item é comprado (garrafa, lata, pacote, maço, kg).",
 "• INGREDIENTE (aba Ficha) e ITEM (abas Compras e Estoque) são a mesma coisa.",
 "• Estoque Início, Compra/Produção, Consumo em Unidade, Estoque Atual, Estoques Mínimos, Sugestão de Compra, Estoque Esperado e Perda / Sobra: tudo em UNIDADE.",
 "• CMV = Custo da Mercadoria Vendida: quanto custam os ingredientes de 1 produto vendido.",
 "• LUCRO R$ = Preço de Venda − CMV.  LUCRO % = quanto do preço de venda sobra depois de pagar os ingredientes.",
 "• Célula AMARELA = você escreve. Célula BRANCA = a planilha calcula sozinha. Não mexa.",
 H+"AS ABAS",
 "• Vendas: onde você cola o relatório de vendas do sistema.",
 "• Ficha: a receita de cada produto, o custo (CMV) e o lucro.",
 "• Compras: o que você comprou e quanto pagou.",
 "• Estoque: quanto você tem de cada item e quanto comprar.",
 H+"PRIMEIRA VEZ",
 "1. Na aba Estoque, escreva o 'Preço da Unidade (R$)' de cada item (quanto você paga por 1 garrafa, 1 lata, 1 kg...). É com ele que a Ficha calcula o CMV.",
 "2. Na aba Ficha, confira o 'Preço de Venda' de cada produto (já veio com os preços do relatório).",
 "3. Confira a 'Quantidade por Unidade' (tamanho da garrafa). Os Estoques Mínimos saem sozinhos do Histórico.",
 H+"TODA SEGUNDA, bar fechado (compra para terça e quarta)",
 "1. (Para ver as perdas) Cole na aba Vendas, embaixo do que já está, as vendas de quinta a domingo. Assim a aba Vendas fica com a semana inteira.",
 "2. (Para ver as perdas) Na aba Estoque, copie a coluna 'Estoque Atual' e cole em 'Estoque Esperado (semana passada)' com Colar Valores. Esse é o que DEVERIA ter.",
 "3. Apague a aba Vendas (selecione as colunas A até E e aperte Delete) e apague o que estiver escrito na aba Compras.",
 "4. Conte o estoque e escreva em 'Estoque Início' (é a contagem da segunda). Bebidas, refri, cerveja e copos: só unidades inteiras (garrafa aberta conta como inteira se tiver mais da metade).",
 "5. A coluna 'Perda / Sobra da semana' mostra sozinha: número negativo = sumiu; positivo = sobrou.",
 "6. No topo da aba Estoque, em 'Dia da compra', escolha Segunda.",
 "7. Compre o que aparece em 'Sugestão de Compra'.",
 "8. Escreva na aba Compras o que comprou (e o que produziu, como xaropes) e quanto pagou.",
 "• Os passos 1 e 2 são opcionais: se pular, a planilha funciona igual, só não mostra as perdas.",
 H+"TODA QUINTA, antes de abrir (compra para quinta, sexta, sábado e domingo)",
 "1. Cole na aba Vendas o relatório de terça e quarta (se o sistema não deixar escolher o período, cole um embaixo do outro).",
 "2. Em 'Dia da compra', escolha Quinta.",
 "3. Compre o que aparece em 'Sugestão de Compra'.",
 "4. Escreva na aba Compras o que comprou (e o que produziu, como xaropes) e quanto pagou.",
 H+"LISTA DE COMPRAS E FORNECEDORES",
 "• Depois de escolher o 'Dia da compra' na aba Estoque, a aba LISTA DE COMPRAS mostra sozinha tudo o que precisa comprar, separado por fornecedor, com quantidade e valor estimado.",
 "• Na rua: marque um X na coluna 'Comprado ✔' de cada item que já pegou (a linha fica riscada).",
 "• Na aba FORNECEDORES, a coluna 'Mensagem do pedido' já monta o texto do pedido de cada fornecedor. É só copiar e mandar no WhatsApp.",
 "• Escreva o telefone/WhatsApp de cada fornecedor na coluna 'Contato'.",
 "• Para trocar de onde compra um item: na aba Estoque, coluna 'Fornecedor principal', escolha outro da lista. A coluna 'Outros fornecedores' mostra as alternativas.",
 "• Mercado Livre demora para chegar: peça antes de acabar. Crestani é por encomenda: avise antes.",
 "• Hortifruti (limões, laranja, ervas, pimenta rosa, ovos): fornecedor principal é a CEASA.",
 H+"IMPRESSÕES (folha diária) E HISTÓRICO",
 "• Aba HISTÓRICO 30 DIAS: cole o relatório de vendas de cada dia na coluna B (um embaixo do outro) e escreva a data na coluna A, só na linha do cabeçalho de cada dia.",
 "• Aba MÉDIA POR DIA: mostra sozinha quanto vende, em média, cada produto em cada dia da semana.",
 "• Aba IMPRESSÕES: folha pronta para imprimir. No fechamento, a equipe conta e escreve 'Final do Movimento' no papel. No dia seguinte, a proprietária digita em 'Início do Movimento', escolhe o dia, e a coluna 'Produção do dia' mostra o que preparar (média daquele dia da semana + 20% − o que já tem).",
 "• Enquanto não houver dias colados no Histórico, a folha usa a venda de referência (sábado = 1; sexta = 1; terça, quarta, quinta e domingo = 1/3).",
 H+"PRODUÇÃO (aba Produção)",
 "• O que é feito no bar fica separado das compras, na aba PRODUÇÃO.",
 "• GELO: a máquina produz 4 sacos de 5 L na quarta, 4 na quinta e 4 na sexta = 12 sacos (60 L) guardados para o fim de semana. Marque X em 'Feito ✔' quando ensacar. Na segunda, apague os X.",
 "• XAROPES E PREPAROS (xarope de açúcar, mel, gengibre, infusão de gin, espuma de gengibre): aparecem sozinhos quando a Sugestão de Compra pede. Depois de produzir, escreva a quantidade na aba Compras (coluna 'Unidades compradas / produzidas').",
 H+"COMO A SUGESTÃO DE COMPRA FUNCIONA",
 "• O bar abre de terça a domingo. Quanto cada dia vende vem da aba HISTÓRICO 30 DIAS (média de cada dia da semana, sem os dias marcados como fora da média).",
 "• ESTOQUE MÍNIMO SEGUNDA = quanto precisa ter para durar terça e quarta (até a compra de quinta).",
 "• ESTOQUE MÍNIMO QUINTA = quanto precisa ter para durar quinta, sexta, sábado e domingo (até a compra de segunda).",
 "• Sugestão de Compra = Estoque Mínimo do dia escolhido − Estoque Atual.",
 "• Na quinta, a compra é feita antes de abrir. Por isso cole só as vendas de terça e quarta.",
 "• Os Estoques Mínimos são calculados SOZINHOS: média de consumo dos dias que a compra precisa cobrir + a Folga de segurança (célula B3 da aba Estoque, 20%). Para comprar mais ou menos, mude só a folga.",
 "• Quanto mais dias colados no Histórico, mais certa fica a conta. Um dia da semana sem nenhum histórico usa a referência (sexta = sábado; terça, quarta, quinta e domingo = 1/3 do sábado).",
 "• Arredondamento: cerveja, refri, copos e itens inteiros sempre para cima; destilados e licores para a garrafa mais próxima (garrafa aberta não força compra); limão e produção da casa de 0,5 em 0,5.",
 "• Se a sugestão estiver vazia, falta escolher o 'Dia da compra'.",
 H+"CMV E LUCRO (aba Ficha)",
 "• Custo ingrediente = quantidade usada × Preço da Unidade do item no Estoque.",
 "• CMV = soma dos custos dos ingredientes da receita.",
 "• Se aparecer 'falta preço', algum ingrediente daquela receita está sem 'Preço da Unidade' na aba Estoque.",
 "• A coluna 'Preço por unidade' da aba Compras mostra quanto você pagou por unidade na última compra. Use para atualizar o 'Preço da Unidade' no Estoque quando o preço mudar.",
 H+"PERDAS (Estoque Esperado × contagem)",
 "• A contagem é feita uma vez só, na segunda, direto em 'Estoque Início'.",
 "• 'Estoque Esperado (semana passada)' = o que a planilha calculou que deveria ter no fim da semana.",
 "• 'Perda / Sobra da semana' = Estoque Início (contado) − Estoque Esperado. Negativo = sumiu (dose maior, quebra, consumo interno, desvio). Positivo = sobrou (dose menor ou erro de contagem).",
 H+"AVISOS QUE APARECEM",
 "• SEM FICHA (aba Vendas): esse produto não tem receita na aba Ficha, então NÃO sai do estoque. Acontece com produto novo ou com nome trocado no sistema.",
 "• COMPRAR (aba Estoque): o item está abaixo do que precisa para o próximo período.",
 "• SEM ESTOQUE (aba Estoque): o item acabou.",
 "• Número em vermelho: ficou negativo.",
 H+"REGRAS IMPORTANTES",
 "• O nome do produto na aba Ficha tem que ser igual ao do relatório do sistema.",
 "• Refri, água, energético, tônica e Baly saem do estoque sempre em unidades inteiras, arredondando para cima o total. Exemplo: 2 Mukifos usam meia lata de Monster cada = 1 lata.",
 "• Limão, laranja e ervas são controlados pela fruta/maço comprado, não pelo suco. Exemplo: 50 ml de suco de limão Taiti = 0,125 kg de limão.",
 "• Gelo: 100% produção própria (máquina). Não entra nas receitas; o plano de produção está na aba Produção.",
 "• A coluna 'Estoque' do relatório do sistema não é usada.",
 H+"COMO CRIAR UMA RECEITA NOVA",
 "1. Vá até o fim da aba Ficha.",
 "2. Na primeira linha, escreva o nome do produto (igual ao relatório) e o Preço de Venda.",
 "3. Em cada linha, escolha um ingrediente na lista e escreva a quantidade. Nas linhas de baixo, o nome do produto pode ficar em branco.",
 "• Item novo no estoque: na aba Estoque, insira uma linha no meio da lista (não no fim) e copie as contas da linha de cima. Escreva o mesmo nome na aba Compras.",
 H+"COMO AS RECEITAS FORAM MONTADAS",
 "• Comidas não têm receita: não são controladas aqui. Fichas de sinuca não saem do estoque.",
 "• Kit dos Guri: só a versão com whisky Passport. Caipa Copão: só a de cachaça Velho Barreiro.",
 "• Promo Caipirinha Dose Dupla = 2 caipirinhas.",
 "• Promo Heineken 600 ml = 2 garrafas. Promo Latão = 3 latas. Promo Long Neck = 3 long necks.",
 "• Doses = 50 ml. A dose de tequila sai do item 'Tequila José Cuervo' (separado da Tequisla do Mukifo).",
 "• Matito: drink pronto, sai 1 unidade por venda.",
 "• Água com gás: 50 ml no Moscow Mule, Jäger Buck e Mojito; 15 ml no Aperol. Espuma de gengibre: 1 talagaço por Moscow Mule.",
 "• Estimativas: 1 kg de limão Taiti dá ~400 ml de suco; siciliano ~350 ml; 1 limão Taiti ≈ 100 g; 1 rodela = 1/8 de limão; 1 laranja = 8 fatias; 1 maço ≈ 50 folhas. Pimenta rosa = 1 g por drink. 3 gotas de angostura ≈ 0,15 ml; 3 dashes ≈ 2,4 ml.",
 "• Tamanho das garrafas: os mais comuns no mercado. Confira com o que você compra.",
 "• Preço de Venda: veio do relatório (total vendido ÷ quantidade). Drinks que ainda não apareceram no relatório estão sem preço.",
 "• Macaco Loco, Pink GT, Sou Eu Bola de Fogo, Mojito, Fitzgerald, Macunaíma, Negrito e Jägerinha ainda não apareceram no relatório. Quando forem vendidos, confira se o nome na Ficha está igual ao do sistema.",
 "• Observação com fundo amarelo na aba Ficha = estimativa para conferir.",
]
wo = wb.create_sheet('Observações')
wo.column_dimensions['A'].width = 120
for k, txt in enumerate(notes, start=1):
    title = txt.startswith(H)
    c = wo.cell(k, 1, txt.lstrip(H)); c.alignment = Alignment(wrap_text=True, vertical='top')
    if title: c.font = Font(bold=True, color='FFFFFF', size=12); c.fill = NAVY
    else: c.fill = GRAY
    c.border = Border(bottom=Side(style='thin', color='FFFFFF'))
wo.sheet_properties.tabColor = 'FFC000'

wb.save(OUT)
print('ok', len(INS), 'itens', len(F), 'fichas')
