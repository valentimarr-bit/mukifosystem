// Módulos do sistema e quem enxerga o quê. O superadmin vê tudo; cada gerente tem a lista escolhida no painel de permissões.
export const MODULOS = [
  { id: 'venda', nome: 'Venda (balcão)', padrao: true },
  { id: 'producao', nome: 'Produção (pedidos e receitas)', padrao: true },
  { id: 'caixa', nome: 'Caixa do turno (sangria e fechamento)', padrao: true },
  { id: 'estoque', nome: 'Estoque', padrao: true },
  { id: 'recomendado', nome: 'Recomendado (segunda e quinta)', padrao: true },
  { id: 'produtos', nome: 'Produtos e lucro', padrao: true },
  { id: 'combos', nome: 'Combos', padrao: true },
  { id: 'niveis', nome: 'Níveis de aviso do estoque', padrao: true },
  { id: 'fotos', nome: 'Fotos', padrao: true },
  { id: 'registrar', nome: 'Registrar compras, contagem e relatório', padrao: true },
  { id: 'fornecedores', nome: 'Fornecedores', padrao: true },
  { id: 'clientes', nome: 'Clientes, pontos e níveis', padrao: true },
  { id: 'desempenho', nome: 'Desempenho (relatórios e indicadores)', padrao: false },
  { id: 'financeiro', nome: 'Financeiro (resultado, contas, fluxo, taxas)', padrao: false },
  { id: 'excel', nome: 'Excel (importar e exportar)', padrao: false },
];
export const IDS = MODULOS.map((m) => m.id);
export const PADRAO_GERENTE = MODULOS.filter((m) => m.padrao).map((m) => m.id);

export function modulosDe(u) {
  if (!u || u.papel === 'superadmin') return [...IDS];
  if (u.modulos == null) return [...PADRAO_GERENTE];
  try { const l = JSON.parse(u.modulos); return Array.isArray(l) ? l.filter((x) => IDS.includes(x)) : [...PADRAO_GERENTE]; } catch { return [...PADRAO_GERENTE]; }
}

/** Que módulo protege essa rota? (null = livre para qualquer pessoa logada, ou pública). */
export function moduloDaRota(p) {
  if (p === '/api/venda/cardapio') return null;
  if (p.startsWith('/api/venda/')) return 'venda';
  if (p.startsWith('/api/producao')) return 'producao';
  if (p.startsWith('/api/clientes')) return 'clientes';
  if (p.startsWith('/api/fornecedores')) return 'fornecedores';
  if (p.startsWith('/api/planilhas')) return 'excel';
  if (p.startsWith('/api/financeiro/caixa')) return 'caixa';
  if (p.startsWith('/api/financeiro/')) return 'financeiro';
  if (p.startsWith('/api/desempenho')) return 'desempenho';
  if (p.startsWith('/api/combos')) return 'combos';
  if (p.startsWith('/api/recomendados') || p.startsWith('/api/lista-compras')) return 'recomendado';
  if (p.startsWith('/api/alertas')) return 'niveis';
  return null;
}
