# Dashboard 3F Node + Postgres

Substitui o Nginx estático por Node.js com:
- Login via Basic Auth
- Dashboard em `/`
- APIs locais `/api/leads`, `/api/leads/eventos`, `/api/leads/resumo`
- Consulta direta ao Postgres interno

No Coolify:
- Use Docker Compose ou repositório Git com estes arquivos.
- Domínio: `https://dash.3fresinados.com.br`
- Porta interna: `3000`
- Ajuste `BASIC_PASS` e `DB_PASSWORD`.
