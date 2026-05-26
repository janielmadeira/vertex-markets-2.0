# Plano de Migração — Unificação de Banco + Supabase Auth

**Data:** 2026-05-25
**Status:** em execução (Fase A concluída)
**Objetivo:** unificar os dois bancos no Supabase E adotar Supabase Auth como sistema de autenticação. Fastify continua como serviço de tempo real (WebSocket, motor de operações), mas valida JWT do Supabase em vez de emitir o próprio.

## Revisão arquitetural (2026-05-25)

Durante a Fase A, descobrimos que o schema do Supabase pressupõe Supabase Auth:
- `profiles.id` é uuid e FK para `auth.users(id)` (gerenciada pelo Supabase)
- `profiles` não tem `email` nem `password`
- As 38 RPCs admin assumem usuário autenticado pelo Supabase Auth
- Schema usa `uuid` (não `cuid` como Prisma)

**Decisão:** adotar Supabase Auth, refatorar auth do Fastify. Tempo estimado revisado: 10-14h.

---

## 1. Estado atual

| Camada | Hoje | Depois |
|---|---|---|
| Banco de dados | 2 bancos separados, sem replicação | 1 banco único: Supabase Postgres |
| Fastify (`apps/api`) | Conecta a `n8n_postgres` (EasyPanel) | Conecta a `db.yilmbwrfaljxgvsygmyz.supabase.co` |
| Next.js admin | Lê de Supabase via 38 RPCs | Continua igual (zero retrabalho) |
| Next.js trading (web client) | Lê de Fastify via axios | Continua igual |
| WebSocket OTC | Fastify, persiste no EasyPanel | Fastify, persiste no Supabase |

---

## 2. Diff de schema (o que precisa entrar no Supabase)

O Supabase já tem: `profiles`, `accounts`, `operations`, `transactions`, `deposits`, `withdrawals`, `admin_users`, `admin_audit_log`, `kyc_submissions`, `support_tickets`, `support_messages`.

**Faltam 2 tabelas (que existem só no EasyPanel):**

1. `otc_assets` — ativos sintéticos (basePrice, volatility, trend, payout, decimals, status, sessões)
2. `otc_candles` — buffer histórico de candles por timeframe

**Faltam 3 colunas em `operations` (para o audit trail SHA256 da Fase 5):**

- `entry_price_source` (enum: SERVER, CLIENT, FALLBACK)
- `exit_price_source` (enum)
- `audit_hash` (varchar 64)

**Possíveis conflitos de nomenclatura a confirmar antes da migração:**

- Prisma usa `User` (`@@map("users")`); Supabase usa `profiles`. Decidir: renomear no Prisma para `Profile` ou criar view `users → profiles`.
- Campos camelCase (Prisma) × snake_case (Supabase). Prisma suporta `@map("campo_snake")` por coluna, não é bloqueante.

---

## 3. Ordem de execução

### Fase A — Preparação (sem efeito em produção)
1. Backup completo do Supabase Postgres (snapshot via painel)
2. Backup do EasyPanel Postgres (`pg_dump` via SSH)
3. Conferir região do EasyPanel vs `sa-east-1` (Supabase). Se diferentes, medir latência média antes de prosseguir
4. Criar branch git `feat/unify-database`

### Fase B — Schema diff no Supabase
5. Executar migration adicionando `otc_assets`, `otc_candles` no Supabase (via `apply_migration` MCP)
6. Executar migration adicionando colunas de audit em `operations`
7. Criar enum `price_source` no Supabase

### Fase B.5 — Preservação do gráfico OTC (CRÍTICO — evita quebrar o gráfico)
7.1. `pg_dump` da tabela `otc_assets` do EasyPanel → arquivo SQL (10 ativos cadastrados)
7.2. `pg_dump` da tabela `otc_candles` do EasyPanel → arquivo SQL (histórico completo)
7.3. `COPY ... FROM` no Supabase importando `otc_assets` (preservando IDs cuid)
7.4. `COPY ... FROM` no Supabase importando `otc_candles`
7.5. **Validação local obrigatória** antes de qualquer deploy:
   - Apontar `DATABASE_URL` do Fastify local para o Supabase
   - Rodar `pnpm dev` no Fastify e no web
   - Abrir a plataforma e confirmar:
     - [ ] Os 10 pares OTC aparecem na lista de ativos
     - [ ] O gráfico renderiza candles históricos
     - [ ] Ticks ao vivo chegam via WebSocket
     - [ ] Cadastro de novo ativo OTC pelo admin funciona
7.6. Se qualquer item falhar, **abortar migração** e reverter `.env` local. Produção segue intocada.

### Fase C — Adaptar Prisma
8. Atualizar `apps/api/prisma/schema.prisma`:
   - Renomear model `User` → `Profile` (`@@map("profiles")`) — ou criar view
   - Adicionar `@map("snake_case")` em todas as colunas camelCase
   - Garantir que todos os `@@map` batem com as tabelas existentes no Supabase
9. Rodar `prisma db pull` apontando para Supabase em modo dry-run para validar
10. Gerar Prisma client (`prisma generate`)

### Fase D — Migração de dados de teste (opcional)
11. Decidir: apagar as 143 operações + 57 transações de teste do Supabase, ou preservar?
12. Se preservar: nenhuma ação. Se apagar: `TRUNCATE` controlado das tabelas de teste

### Fase E — Switch
13. Trocar `DATABASE_URL` no `.env` do Fastify para apontar Supabase (via connection pooler `pgbouncer` na porta 6543)
14. Subir Fastify em ambiente local primeiro — rodar suite de testes
15. Deploy no EasyPanel

### Fase F — Validação ponta a ponta
16. Cadastro de usuário via Fastify → conferir aparece em "Usuários" do admin (Supabase RPC)
17. Operação via Fastify → conferir aparece em "Operações" do admin
18. Aprovar KYC pelo admin → conferir o usuário consegue sacar via Fastify
19. Audit log: rodar uma operação, verificar `audit_hash` foi gravado e bate via `/admin/audit/operations/:id/verify`

---

## 4. Mudanças de código previstas

**Arquivos que mudam:**
- `apps/api/prisma/schema.prisma` — renomear model User, adicionar `@map`, adicionar otc_assets/otc_candles ao schema (já existe), confirmar tudo bate com Supabase
- `apps/api/.env` e `apps/api/.env.example` — trocar `DATABASE_URL`
- `apps/api/src/auth/service.ts` — se renomear `User` → `Profile`, atualizar todas as referências
- `apps/api/src/accounts/routes.ts` — idem
- `apps/api/src/operations/service.ts` — idem
- `apps/api/src/admin/audit.ts` — idem
- Possíveis ajustes em RLS: Supabase tem RLS habilitado em todas as tabelas. Fastify usa connection string com role autenticada, mas pode precisar do **service_role key** ou bypass de RLS via conexão direta (porta 5432, não pooler).

**Arquivos que NÃO mudam:**
- Toda a UI de admin (38 RPCs continuam funcionando)
- WebSocket hub (`ws-hub.ts`, `ws-routes.ts`) — só lê Redis
- Engine OTC — só lê Redis e persiste candles via Prisma (que já vai estar apontando pro lugar certo)

---

## 5. Risco e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Latência Fastify→Supabase impactar trading | Média | Alto | Usar connection pooler (6543); manter Redis local como buffer; medir antes |
| RLS bloquear queries do Fastify | Alta | Alto | Usar service_role key na connection string do Prisma OU desabilitar RLS para conexões via Prisma com bypass token |
| Conflito de nomenclatura User × profiles | Alta | Médio | Renomear no Prisma — caminho mais limpo |
| Quebrar trades de teste em andamento | Baixa | Baixo | Cancelar/fechar trades OPEN antes de migrar |
| Custo Supabase (free tier estoura) | Média | Baixo | Monitorar; upgrade pago ~$25/mês se necessário |

---

## 6. Rollback

- **Antes da Fase E (switch):** sem rollback necessário, nada em produção mudou
- **Após Fase E:** reverter `DATABASE_URL` no EasyPanel para o Postgres antigo
- O Postgres do EasyPanel permanece intocado durante todo o processo (só fica de standby), permitindo voltar atrás em <5 minutos
- Decisão final de aposentar o Postgres EasyPanel só depois de 7 dias rodando em produção sem incidentes

---

## 7. Estimativa de esforço

| Fase | Tempo estimado |
|---|---|
| A — Preparação | 30 min |
| B — Schema diff Supabase | 1h |
| B.5 — Preservação OTC | 1h |
| C — Adaptar Prisma | 2-3h |
| D — Dados de teste | 15 min |
| E — Switch + deploy | 1h |
| F — Validação | 1-2h |
| **Total** | **7-9h** (1 sessão longa ou 2 médias) |

---

## 8. Critérios de sucesso (definição de "pronto")

- [ ] Cadastro via Fastify aparece no painel admin (Supabase)
- [ ] Operação aberta via Fastify aparece em `public.operations` no Supabase
- [ ] WebSocket de preço OTC continua funcionando (<100ms latência aceitável)
- [ ] **Os 10 pares OTC aparecem no gráfico após o switch**
- [ ] **Histórico de candles preservado (não começa do zero)**
- [ ] **Cadastro de novo ativo OTC pelo admin grava no Supabase**
- [ ] Aprovação de KYC pelo admin libera saque no Fastify
- [ ] `/admin/audit/operations/recent` retorna operações com `audit_hash` preenchido
- [ ] Suite de testes do Fastify passa 100%
- [ ] Painel admin não apresenta nenhuma regressão

---

## 9. Decisões que travamos para você

Antes de executar, precisamos da sua confirmação em:

1. ~~**Apagar ou preservar as 143 operações de teste**~~ → **APAGAR** (confirmado)
2. ~~**Renomear `User` → `Profile`**~~ → **RENOMEAR** (confirmado)
3. ~~**Janela de execução**~~ → **SESSÃO ÚNICA** (confirmado)
4. ~~**Confirmar que ainda não há clientes reais**~~ → **CONFIRMADO** (só 1 cadastro)

## 10. Pendência pós-migração (não bloqueia esta sessão)

**Decisão de região da infra:**
- Droplet hoje: SFO2 (São Francisco)
- Supabase hoje: sa-east-1 (São Paulo)
- Latência atual API↔DB: ~150-180ms (problemático em produção)
- Público-alvo: **global**

A decidir antes do beta fechado:
- (a) Mover droplet pra `sa-east-1` (match Supabase atual, bom pra clientes BR/LATAM)
- (b) Mover droplet pra `nyc1`/`nyc3` (perto do Supabase US East — exigiria criar novo projeto Supabase) — compromisso global razoável
- (c) Mover Fastify pra Vercel Edge / Cloudflare Workers — desafia o motor WebSocket

Sem ação nesta migração; só registrar como dívida técnica a resolver antes de aceitar dinheiro real.
