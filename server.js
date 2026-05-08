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

const toMs = (v) => v ? String(Math.round(Number(v))) : '0';

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/leads', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        lead_id, numero, nome_contato, instancia,
        origem_lead, origem_canal, campanha, landing_page,
        utm_source, utm_medium, utm_campaign, utm_content,
        status_atendimento, status_lead,
        produto_detectado, quantidade_detectada, medida_detectada,
        uso_detectado, cidade_detectada, tem_arte,
        COALESCE(prazo_detectado, '') AS prazo_detectado,
        COALESCE(acabamento_detectado, '') AS acabamento_detectado,
        historico_json,
        CASE WHEN vendedor_notificado = true THEN 'true' ELSE 'false' END AS vendedor_notificado,
        CASE WHEN vendedor_notificado = true THEN 'true' ELSE 'false' END AS handoff_sucesso,
        COALESCE(EXTRACT(EPOCH FROM ultima_notificacao_vendedor) * 1000, 0) AS ultima_notificacao_vendedor,
        COALESCE(EXTRACT(EPOCH FROM created_at) * 1000, 0) AS created_at,
        COALESCE(EXTRACT(EPOCH FROM updated_at) * 1000, 0) AS updated_at,
        COALESCE(EXTRACT(EPOCH FROM ultima_interacao_at) * 1000, 0) AS ultima_interacao_at,
        COALESCE(EXTRACT(EPOCH FROM primeira_entrada_at) * 1000, 0) AS primeira_entrada_at,
        COALESCE(EXTRACT(EPOCH FROM handoff_at) * 1000, 0) AS handoff_at,
        CASE WHEN perdido_inatividade = true THEN 'true' ELSE 'false' END AS perdido_inatividade
      FROM leads_atendimento
      WHERE numero NOT IN (SELECT numero FROM numeros_teste)
      ORDER BY updated_at DESC
      LIMIT 1000;
    `);

    res.json(rows.map(l => ({
      lead_id: l.lead_id || '',
      numero: l.numero || '',
      nome_contato: l.nome_contato || '',
      instancia: l.instancia || '',
      origem_lead: l.origem_lead || '',
      origem_canal: l.origem_canal || '',
      campanha: l.campanha || '',
      landing_page: l.landing_page || '',
      utm_source: l.utm_source || '',
      utm_medium: l.utm_medium || '',
      utm_campaign: l.utm_campaign || '',
      utm_content: l.utm_content || '',
      status_atendimento: l.status_atendimento || 'ia',
      status_lead: l.status_lead || 'novo',
      produto_detectado: l.produto_detectado || 'indefinido',
      quantidade_detectada: l.quantidade_detectada || '',
      medida_detectada: l.medida_detectada || '',
      uso_detectado: l.uso_detectado || '',
      cidade_detectada: l.cidade_detectada || '',
      tem_arte: l.tem_arte || '',
      prazo_detectado: l.prazo_detectado || '',
      acabamento_detectado: l.acabamento_detectado || '',
      historico_json: l.historico_json || '[]',
      vendedor_notificado: String(l.vendedor_notificado || 'false'),
      handoff_sucesso: String(l.handoff_sucesso || 'false'),
      ultima_notificacao_vendedor: toMs(l.ultima_notificacao_vendedor),
      created_at: toMs(l.created_at),
      updated_at: toMs(l.updated_at),
      ultima_interacao_at: toMs(l.ultima_interacao_at),
      primeira_entrada_at: toMs(l.primeira_entrada_at),
      handoff_at: toMs(l.handoff_at),
      perdido_inatividade: String(l.perdido_inatividade || 'false')
    })));
  } catch (err) {
    console.error('GET /api/leads error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leads/eventos', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        evento_id, lead_id, numero, nome_contato, tipo_evento,
        origem_lead, origem_canal, campanha, landing_page,
        utm_source, utm_medium, utm_campaign, utm_content,
        produto_detectado, quantidade_detectada, medida_detectada,
        uso_detectado, cidade_detectada, tem_arte,
        COALESCE(prazo_detectado, '') AS prazo_detectado,
        COALESCE(acabamento_detectado, '') AS acabamento_detectado,
        status_lead, status_atendimento,
        CASE WHEN handoff = true THEN 'true' ELSE 'false' END AS handoff,
        COALESCE(EXTRACT(EPOCH FROM created_at) * 1000, 0) AS created_at,
        observacao
      FROM eventos_leads
      WHERE numero NOT IN (SELECT numero FROM numeros_teste)
      ORDER BY created_at DESC
      LIMIT 1000;
    `);

    res.json(rows.map(e => ({
      evento_id: e.evento_id || '',
      lead_id: e.lead_id || '',
      numero: e.numero || '',
      nome_contato: e.nome_contato || '',
      tipo_evento: e.tipo_evento || '',
      origem_lead: e.origem_lead || '',
      origem_canal: e.origem_canal || '',
      campanha: e.campanha || '',
      landing_page: e.landing_page || '',
      utm_source: e.utm_source || '',
      utm_medium: e.utm_medium || '',
      utm_campaign: e.utm_campaign || '',
      utm_content: e.utm_content || '',
      produto_detectado: e.produto_detectado || 'indefinido',
      quantidade_detectada: e.quantidade_detectada || '',
      medida_detectada: e.medida_detectada || '',
      uso_detectado: e.uso_detectado || '',
      cidade_detectada: e.cidade_detectada || '',
      tem_arte: e.tem_arte || '',
      prazo_detectado: e.prazo_detectado || '',
      acabamento_detectado: e.acabamento_detectado || '',
      status_lead: e.status_lead || '',
      status_atendimento: e.status_atendimento || '',
      handoff: String(e.handoff || 'false'),
      created_at: toMs(e.created_at),
      observacao: e.observacao || ''
    })));
  } catch (err) {
    console.error('GET /api/leads/eventos error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leads/resumo', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH base AS (
        SELECT *,
          COALESCE(NULLIF(utm_campaign, ''), NULLIF(campanha, ''), 'sem_campanha') AS campanha_final,
          COALESCE(NULLIF(produto_detectado, ''), 'indefinido') AS produto_final
        FROM leads_atendimento
        WHERE numero NOT IN (SELECT numero FROM numeros_teste)
      ), resumo AS (
        SELECT
          COUNT(*) AS total_leads,
          COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS leads_hoje,
          COUNT(*) FILTER (WHERE status_atendimento = 'vendedor') AS enviados_vendedor,
          COUNT(*) FILTER (WHERE status_lead = 'qualificado') AS qualificados,
          COUNT(*) FILTER (WHERE status_lead = 'em_qualificacao') AS em_qualificacao,
          COUNT(*) FILTER (WHERE status_lead = 'sem_resposta' OR perdido_inatividade = true) AS sem_resposta,
          COUNT(*) FILTER (WHERE status_lead = 'perdido') AS perdidos,
          ROUND(((COUNT(*) FILTER (WHERE status_atendimento = 'vendedor')::numeric / NULLIF(COUNT(*), 0)) * 100), 2) AS taxa_qualificacao
        FROM base
      ), por_campanha AS (
        SELECT COALESCE(json_agg(json_build_object('campanha', campanha_final, 'total', total, 'enviados_vendedor', enviados_vendedor, 'sem_resposta', sem_resposta) ORDER BY total DESC), '[]'::json) AS dados
        FROM (
          SELECT campanha_final, COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status_atendimento = 'vendedor') AS enviados_vendedor,
            COUNT(*) FILTER (WHERE status_lead = 'sem_resposta' OR perdido_inatividade = true) AS sem_resposta
          FROM base GROUP BY campanha_final ORDER BY total DESC LIMIT 20
        ) x
      ), por_produto AS (
        SELECT COALESCE(json_agg(json_build_object('produto', produto_final, 'total', total, 'enviados_vendedor', enviados_vendedor) ORDER BY total DESC), '[]'::json) AS dados
        FROM (
          SELECT produto_final, COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status_atendimento = 'vendedor') AS enviados_vendedor
          FROM base GROUP BY produto_final ORDER BY total DESC LIMIT 20
        ) x
      ), por_status AS (
        SELECT COALESCE(json_agg(json_build_object('status_lead', status_lead, 'total', total) ORDER BY total DESC), '[]'::json) AS dados
        FROM (
          SELECT COALESCE(NULLIF(status_lead, ''), 'sem_status') AS status_lead, COUNT(*) AS total
          FROM base GROUP BY COALESCE(NULLIF(status_lead, ''), 'sem_status') ORDER BY total DESC
        ) x
      )
      SELECT resumo.*, por_campanha.dados AS por_campanha, por_produto.dados AS por_produto, por_status.dados AS por_status
      FROM resumo, por_campanha, por_produto, por_status;
    `);

    const r = rows[0] || {};
    res.json({
      total_leads: Number(r.total_leads || 0),
      leads_hoje: Number(r.leads_hoje || 0),
      enviados_vendedor: Number(r.enviados_vendedor || 0),
      qualificados: Number(r.qualificados || 0),
      em_qualificacao: Number(r.em_qualificacao || 0),
      sem_resposta: Number(r.sem_resposta || 0),
      perdidos: Number(r.perdidos || 0),
      taxa_qualificacao: Number(r.taxa_qualificacao || 0),
      por_campanha: r.por_campanha || [],
      por_produto: r.por_produto || [],
      por_status: r.por_status || [],
      atualizado_em: new Date().toISOString()
    });
  } catch (err) {
    console.error('GET /api/leads/resumo error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static('public'));

app.listen(PORT, () => console.log(`Dashboard 3F rodando na porta ${PORT}`));
