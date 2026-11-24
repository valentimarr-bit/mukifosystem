// Categorias do cardápio. A sugestão automática vale só para produto SEM categoria; o gerente ajusta no editor.
export const ORDEM_CATEGORIAS = ['Promoções e kits', 'Drinks', 'Doses', 'Cervejas e long necks', 'Energéticos',
  'Refrigerantes e águas', 'Porções', 'Pratos e lanches', 'Outros'];

const tem = (n, ...ts) => ts.some((t) => n.includes(t));

/** Sugere a categoria pelo nome do produto (nome_normalizado: maiúsculas). */
export function categoriaDoProduto(nome) {
  const n = String(nome ?? '').toLocaleUpperCase('pt-BR').replace(/\s+/g, ' ').trim();
  if (tem(n, 'PROMO') || n.startsWith('KIT')) return 'Promoções e kits';
  if (n.startsWith('DOSE ')) return 'Doses';
  if (tem(n, '&', ' COM ', ' CM ', 'CAIPI', 'FERNET COLA', 'JAGER', 'JÄGER', 'KURTZ', 'PENICILIN', 'SPRITZ', 'GIN TONICA', 'MULE', 'SOUR',
    'AMANSA', 'TROPICAL GIN', 'NEGRONI', 'KARIREL', 'MATITO', 'MACACO', 'PINK GT', 'BOLA DE FOGO', 'MOJITO', 'FITZGERALD', 'MACUNAIMA',
    'NEGRITO', 'HECHO EN') || n === 'MUKIFO') return 'Drinks';
  if (tem(n, 'RED BULL', 'REDBULL', 'MONSTER', 'ENERGETICO', 'ENERGÉTICO')) return 'Energéticos';
  if (tem(n, 'HEINEKEN', 'BRAHMA', 'ORIGINAL', 'STELLA', 'CORONA', 'BEATS', 'LITRAO', 'LITRÃO')) return 'Cervejas e long necks';
  if (tem(n, 'ÁGUA', 'AGUA', 'COCA', 'SPRITE', 'FANTA', 'GUARANA', 'GUARANÁ', 'TÔNICA', 'TONICA', 'CITRUS', 'DEL VALE', 'MASCATE', 'LIMONADA')) return 'Refrigerantes e águas';
  if (tem(n, 'BATATA', 'ANÉIS', 'ANEIS', 'DADINHOS', 'FISH', 'POLENTA', 'AIPIM', 'CROQUETE', 'CEBOLA', 'OVO')) return 'Porções';
  if (tem(n, 'XIS', 'A LÁ', 'MILANESA', 'PARMEGIANA', 'STROGONOFF', 'FEIJÃO', 'PRATO DO DIA', 'BIFE', 'CARNE LOKA', 'CHORIPÃO')) return 'Pratos e lanches';
  return 'Outros';
}

/** Ordena nomes de categoria: as conhecidas na ordem do bar, as novas depois (A→Z). */
export function ordenarCategorias(nomes) {
  const pos = (c) => { const i = ORDEM_CATEGORIAS.indexOf(c); return i < 0 ? 999 : i; };
  return [...nomes].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b, 'pt-BR'));
}
