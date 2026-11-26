// Módulos do sistema e quem enxerga o quê. O superadmin vê tudo; cada gerente tem a lista escolhida no painel de permissões.
export const MODULOS = [
  { id: 'venda', nome: 'Venda (balcão)', padrao: true },
  { id: 'producao', nome: 'Produção (pedidos e receitas)', padrao: true },
  { id: 'cancelar', nome: 'Cancelar pedidos (com motivo; fica no histórico)', padrao: true },
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
  { id: 'campeonato', nome: 'Campeonato de sinuca', padrao: true },
  { id: 'desempenho', nome: 'Desempenho (relatórios e indicadores)', padrao: false },
  { id: 'financeiro', nome: 'Financeiro (resultado, contas, fluxo, taxas)', padrao: false },
  { id: 'excel', nome: 'Excel (importar e exportar)', padrao: false },
];
export const IDS = MODULOS.map((m) => m.id);
export const PADRAO_GERENTE = MODULOS.filter((m) => m.padrao).map((m) => m.id);

export const PADRAO_ATENDENTE = ['venda', 'producao'];

/** Papel de quem está logado: superadmin (Dono), atendente (cargo) ou gerente. */
export function papelDe(u) {
  return u?.papel === 'superadmin' ? 'superadmin' : u?.cargo === 'atendente' ? 'atendente' : 'gerente';
}

export const NOME_CARGO = { superadmin: 'Dono', gerente: 'Gerente', atendente: 'Atendente' };

export function modulosDe(u) {
  if (!u || u.papel === 'superadmin') return [...IDS];
  const padrao = papelDe(u) === 'atendente' ? PADRAO_ATENDENTE : PADRAO_GERENTE;
  if (u.modulos == null) return [...padrao];
  try { const l = JSON.parse(u.modulos); return Array.isArray(l) ? l.filter((x) => IDS.includes(x)) : [...padrao]; } catch { return [...padrao]; }
}

/** Que módulo protege essa rota? Devolve um módulo, uma lista (basta ter um deles) ou null (livre para qualquer pessoa logada, ou pública). */
export function moduloDaRota(p, m = 'GET') {
  if (p === '/api/venda/cardapio') return null;
  if (p.startsWith('/api/venda/')) return 'venda';
  if (p === '/api/cancelamentos' || /^\/api\/pedidos\/[\w-]+\/cancelar$/.test(p)) return 'cancelar';
  if (p.startsWith('/api/producao') || p === '/api/canais/sincronizar') return 'producao';
  if (p.startsWith('/api/canais')) return 'venda';
  if (p.startsWith('/api/fiscal')) return 'financeiro';
  if (p.startsWith('/api/pagamentos/') && !p.startsWith('/api/pagamentos/aviso/')) return 'financeiro';
  if (p.startsWith('/api/campeonato/gestao') || p.startsWith('/api/sinuca/gestao')) return 'campeonato';
  if (p.startsWith('/api/clientes')) return 'clientes';
  if (p.startsWith('/api/fornecedores')) return 'fornecedores';
  if (p.startsWith('/api/planilhas')) return 'excel';
  if (p.startsWith('/api/financeiro/caixa')) return 'caixa';
  if (p.startsWith('/api/financeiro/')) return 'financeiro';
  if (p.startsWith('/api/desempenho')) return 'desempenho';
  if (p.startsWith('/api/combos')) return 'combos';
  if (p === '/api/recomendados' || p.startsWith('/api/recomendados/')) return 'recomendado';
  if (p === '/api/lista-compras') return ['recomendado', 'registrar'];
  if (p === '/api/listas' || p.startsWith('/api/listas/')) return ['registrar', 'recomendado'];
  if (p === '/api/estoque') return ['estoque', 'recomendado', 'niveis', 'fotos', 'registrar'];
  if (p === '/api/insumos') return ['produtos', 'registrar', 'estoque', 'fotos'];
  if (p === '/api/produtos' || p.startsWith('/api/produtos/')) return m === 'GET' ? ['produtos', 'combos', 'fotos'] : 'produtos';
  if (['/api/compras', '/api/contagem', '/api/vendas/relatorio'].includes(p)) return 'registrar';
  if (p.startsWith('/api/fotos/') && m !== 'GET') return 'fotos';
  if (p.startsWith('/api/alertas')) return 'niveis';
  return null;
}
