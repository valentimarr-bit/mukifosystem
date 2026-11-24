-- Campeonato de sinuca: vários campeonatos, cada um com modalidades; inscrição paga por Pix/carteira; chave de mata-mata.
CREATE TABLE campeonato (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  data      TEXT,
  local     TEXT,
  status    TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'encerrado')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE modalidade (
  id            TEXT PRIMARY KEY,
  campeonato_id TEXT NOT NULL REFERENCES campeonato(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  taxa          REAL NOT NULL DEFAULT 0,
  vagas         INTEGER,
  premio_pct    TEXT NOT NULL DEFAULT '[50,25,15]',   -- % do arrecadado para 1º, 2º, 3º...; o resto fica com a casa
  status        TEXT NOT NULL DEFAULT 'inscricoes' CHECK (status IN ('inscricoes', 'andamento', 'encerrada')),
  rodadas       INTEGER,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_modalidade_camp ON modalidade (campeonato_id);
CREATE TABLE inscricao (
  id            TEXT PRIMARY KEY,
  modalidade_id TEXT NOT NULL REFERENCES modalidade(id) ON DELETE CASCADE,
  cliente_id    TEXT REFERENCES cliente(id) ON DELETE SET NULL,   -- nulo = inscrito no balcão, sem conta
  nome          TEXT NOT NULL,
  valor         REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga', 'cancelada')),
  forma         TEXT,                                              -- pix | saldo | balcao | teste
  criada_em     TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em     TEXT,
  paga_em       TEXT,
  operador      TEXT,
  colocacao     INTEGER
);
CREATE INDEX idx_inscricao_mod ON inscricao (modalidade_id, status);
CREATE UNIQUE INDEX idx_inscricao_unica ON inscricao (modalidade_id, cliente_id) WHERE cliente_id IS NOT NULL AND status <> 'cancelada';
CREATE TABLE partida (
  id            TEXT PRIMARY KEY,
  modalidade_id TEXT NOT NULL REFERENCES modalidade(id) ON DELETE CASCADE,
  fase          INTEGER NOT NULL,
  pos           INTEGER NOT NULL,
  chave         TEXT NOT NULL DEFAULT 'W',                         -- W = chave principal, T = disputa de 3º
  a_id          TEXT REFERENCES inscricao(id),
  b_id          TEXT REFERENCES inscricao(id),
  placar_a      INTEGER NOT NULL DEFAULT 0,
  placar_b      INTEGER NOT NULL DEFAULT 0,
  vencedor_id   TEXT,
  status        TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'pronta', 'em_jogo', 'finalizada')),
  mesa          TEXT,
  prox_id       TEXT,
  prox_lado     TEXT,
  perc_id       TEXT,
  perc_lado     TEXT,
  atualizada_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_partida_mod ON partida (modalidade_id, fase, pos);
