const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASIC_USER = process.env.BASIC_USER || 'admin';
const BASIC_PASS = process.env.BASIC_PASS || 'troque-esta-senha';

const pool = new Pool({
  host: process.env.DB_HOST || 'u3gnz8eszn84fyjbjo25pzk3',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    res.set('WWW-Authenticate', 'Basic realm="Dashboard 3F"');
    return res.status(401).send('Autenticação necessária.');
  }
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);
  if (user === BASIC_USER && pass === BASIC_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Dashboard 3F"');
  return res.status(401).send('Usuário ou senha inválidos.');
}

app.use(auth);

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Lista de leads ──────────────────────────────────────────────────────────
app.get('/api/leads', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        numero,
        nome_contato,
        etapa_atual,
        produto_interesse,
        origem_canal,
        landing_page,
        onde_achou,
        finalidade,
        quantidade,
        tem_logo,
        status_atendimento,
        vendedor_notificado,
        COALESCE(EXTRACT(EPOCH FROM atualizado_em) * 1000, 0) AS atualizado_em,
        COALESCE(EXTRACT(EPOCH FROM criado_em)    * 1000, 0) AS criado_em
      FROM leads_sdr
      ORDER BY atualizado_em DESC
      LIMIT 1000;
    `);

    res.json(rows.map(l => ({
      numero:              l.numero || '',
      nome_contato:        l.nome_contato || '',
      etapa_atual:         l.etapa_atual || 'novo',
      produto_interesse:   l.produto_interesse || 'indefinido',
      origem_canal:        l.origem_canal || '',
      landing_page:        l.landing_page || '',
      onde_achou:          l.onde_achou || '',
      finalidade:          l.finalidade || '',
      quantidade:          l.quantidade || '',
      tem_logo:            l.tem_logo || '',
      status_atendimento:  l.status_atendimento || 'sdr',
      vendedor_notificado: String(l.vendedor_notificado || 'false'),
      atualizado_em:       String(Math.round(Number(l.atualizado_em || 0))),
      criado_em:           String(Math.round(Number(l.criado_em || 0))),
    })));
  } catch (err) {
    console.error('GET /api/leads error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Resumo / KPIs ───────────────────────────────────────────────────────────
app.get('/api/leads/resumo', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH base AS (
        SELECT * FROM leads_sdr
      ),
      kpis AS (
        SELECT
          COUNT(*)                                                        AS total_leads,
          COUNT(*) FILTER (WHERE criado_em::date = CURRENT_DATE)         AS leads_hoje,
          COUNT(*) FILTER (WHERE vendedor_notificado = true)             AS enviados_vendedor,
          COUNT(*) FILTER (WHERE status_atendimento = 'sdr')             AS em_qualificacao,
          ROUND(
            (COUNT(*) FILTER (WHERE vendedor_notificado = true)::numeric
             / NULLIF(COUNT(*), 0)) * 100, 1
          )                                                               AS taxa_qualificacao
        FROM base
      ),
      por_produto AS (
        SELECT COALESCE(json_agg(
          json_build_object('produto', produto, 'total', total, 'vendedor', vendedor)
          ORDER BY total DESC
        ), '[]'::json) AS dados
        FROM (
          SELECT
            COALESCE(NULLIF(produto_interesse,''), 'indefinido') AS produto,
            COUNT(*)                                              AS total,
            COUNT(*) FILTER (WHERE vendedor_notificado = true)   AS vendedor
          FROM base
          GROUP BY produto
          ORDER BY total DESC LIMIT 10
        ) x
      ),
      por_origem AS (
        SELECT COALESCE(json_agg(
          json_build_object('origem', origem, 'total', total, 'vendedor', vendedor)
          ORDER BY total DESC
        ), '[]'::json) AS dados
        FROM (
          SELECT
            COALESCE(NULLIF(origem_canal,''), 'desconhecido') AS origem,
            COUNT(*)                                           AS total,
            COUNT(*) FILTER (WHERE vendedor_notificado = true) AS vendedor
          FROM base
          GROUP BY origem
          ORDER BY total DESC LIMIT 10
        ) x
      ),
      por_etapa AS (
        SELECT COALESCE(json_agg(
          json_build_object('etapa', etapa, 'total', total)
          ORDER BY total DESC
        ), '[]'::json) AS dados
        FROM (
          SELECT
            COALESCE(NULLIF(etapa_atual,''), 'novo') AS etapa,
            COUNT(*) AS total
          FROM base
          GROUP BY etapa
          ORDER BY total DESC
        ) x
      ),
      por_dia AS (
        SELECT COALESCE(json_agg(
          json_build_object('dia', dia, 'total', total)
          ORDER BY dia
        ), '[]'::json) AS dados
        FROM (
          SELECT
            criado_em::date AS dia,
            COUNT(*)        AS total
          FROM base
          WHERE criado_em >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY dia
          ORDER BY dia
        ) x
      ),
      onde_achou_agg AS (
        SELECT COALESCE(json_agg(
          json_build_object('onde', onde, 'total', total)
          ORDER BY total DESC
        ), '[]'::json) AS dados
        FROM (
          SELECT
            COALESCE(NULLIF(onde_achou,''), 'não informado') AS onde,
            COUNT(*) AS total
          FROM base
          WHERE onde_achou IS NOT NULL AND onde_achou != ''
          GROUP BY onde
          ORDER BY total DESC LIMIT 10
        ) x
      ),
      por_lp AS (
        SELECT COALESCE(json_agg(
          json_build_object('lp', lp, 'total', total, 'vendedor', vendedor)
          ORDER BY total DESC
        ), '[]'::json) AS dados
        FROM (
          SELECT
            COALESCE(NULLIF(landing_page,''), 'sem_lp') AS lp,
            COUNT(*)                                     AS total,
            COUNT(*) FILTER (WHERE vendedor_notificado = true) AS vendedor
          FROM base
          WHERE landing_page IS NOT NULL AND landing_page != ''
          GROUP BY lp
          ORDER BY total DESC LIMIT 10
        ) x
      )
      SELECT
        kpis.*,
        por_produto.dados   AS por_produto,
        por_origem.dados    AS por_origem,
        por_etapa.dados     AS por_etapa,
        por_dia.dados       AS por_dia,
        onde_achou_agg.dados AS onde_achou,
        por_lp.dados        AS por_lp
      FROM kpis, por_produto, por_origem, por_etapa, por_dia, onde_achou_agg, por_lp;
    `);

    const r = rows[0] || {};
    res.json({
      total_leads:       Number(r.total_leads || 0),
      leads_hoje:        Number(r.leads_hoje || 0),
      enviados_vendedor: Number(r.enviados_vendedor || 0),
      em_qualificacao:   Number(r.em_qualificacao || 0),
      taxa_qualificacao: Number(r.taxa_qualificacao || 0),
      por_produto:       r.por_produto || [],
      por_origem:        r.por_origem || [],
      por_etapa:         r.por_etapa || [],
      por_dia:           r.por_dia || [],
      onde_achou:        r.onde_achou || [],
      por_lp:            r.por_lp || [],
      atualizado_em:     new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/leads/resumo error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Histórico de mensagens dos leads (para análise de padrões) ──────────────
app.get('/api/leads/mensagens', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        numero,
        nome_contato,
        produto_interesse,
        origem_canal,
        msg->>'content' AS mensagem,
        to_timestamp((msg->>'ts')::bigint / 1000) AS horario
      FROM leads_sdr,
        jsonb_array_elements(historico_conversa::jsonb) AS msg
      WHERE msg->>'role' = 'user'
        AND historico_conversa IS NOT NULL
        AND historico_conversa != '[]'
      ORDER BY numero, horario DESC
      LIMIT 2000;
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/leads/mensagens error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static('public'));

app.listen(PORT, () => console.log(`Dashboard 3F rodando na porta ${PORT}`));
