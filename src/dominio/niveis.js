// Níveis dos clientes: gamificação com a cara do Brasil (e do Sul). Começa no Caramelo e termina na Nota de 200.
// 1 ponto = R$ 1 pago. O nível vem de tudo que a pessoa já ganhou (pontos_total), então nunca cai.
export const NIVEIS = [
  { nivel: 1, nome: 'Caramelo', emoji: '🐕', min: 0, frase: 'Todo mundo começa aqui: simpático, leal e sempre bem-vindo.' },
  { nivel: 2, nome: 'Pão de Queijo', emoji: '🧀', min: 150, frase: 'Já é da casa: quentinho e impossível de comer um só.' },
  { nivel: 3, nome: 'Cuia de Chimarrão', emoji: '🧉', min: 400, frase: 'Roda de amigos garantida: onde tem você, tem conversa.' },
  { nivel: 4, nome: 'Pastel de Feira', emoji: '🥟', min: 800, frase: 'Figurinha carimbada: todo mundo conhece e todo mundo gosta.' },
  { nivel: 5, nome: 'Churrasco de Domingo', emoji: '🍖', min: 1500, frase: 'Reúne a turma e faz o fim de semana valer a pena.' },
  { nivel: 6, nome: 'Samba no Pé', emoji: '🪘', min: 2500, frase: 'Chegou e a festa começou: alegria que contagia.' },
  { nivel: 7, nome: 'Onça-Pintada', emoji: '🐆', min: 4000, frase: 'Rara de ver e respeitada por todos: presença que chama atenção.' },
  { nivel: 8, nome: 'Nota de 200', emoji: '💸', min: 6000, frase: 'O topo: com o lobo-guará estampado, raro, valioso e adorado.' },
];

export function nivelDe(pontosTotal) {
  const n = Math.max(0, Math.floor(Number(pontosTotal) || 0));
  let atual = NIVEIS[0];
  for (const x of NIVEIS) if (n >= x.min) atual = x;
  const proximo = NIVEIS.find((x) => x.min > n) ?? null;
  return { ...atual, proximo: proximo ? { nivel: proximo.nivel, nome: proximo.nome, emoji: proximo.emoji, faltam: proximo.min - n } : null,
    progresso_pct: proximo ? Math.round(((n - atual.min) / (proximo.min - atual.min)) * 100) : 100 };
}
