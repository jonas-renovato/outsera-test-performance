# Testes de Performance — DummyJSON API (K6)

## Objetivo

Validar o comportamento da API pública [DummyJSON](https://dummyjson.com) sob carga, com dois testes:

- **Smoke**: valida endpoints, ambiente, checks e thresholds com carga mínima (10 VUs / 30s).
- **Load**: simula 500 usuários simultâneos por 5 minutos e mede erro, latência e vazão.

> A DummyJSON é um serviço público compartilhado. Os resultados refletem também a rede e o limite da plataforma, não apenas a API. Use cargas altas com responsabilidade.

## Tecnologias

- [K6](https://k6.io/docs/) (>= 0.45) — JavaScript ES modules
- `k6-summary` (jslib) para o relatório de texto no `handleSummary` (requer acesso à internet, necessário de qualquer forma para o teste)

## Arquitetura

```text
config/environment.js   # configuração centralizada (env vars -> config)
lib/api.js              # requisições, checks, métricas custom e jornada do usuário
lib/thresholds.js       # fábrica de thresholds (global + por endpoint)
lib/summary.js          # handleSummary: stdout + JSON + TXT em reports/
tests/smoke.js          # cenário smoke
tests/load.js           # cenário load
reports/                # saída automática (summary .json/.txt) — ignorada pelo git
docs/                   # evidências manuais e análise
```

Decisões técnicas:

- **Jornada única reutilizada** (`userJourney`): `GET /users` → `GET /users/1` → `POST /auth/login` → think time. Smoke e Load executam exatamente o mesmo fluxo; só mudam carga e limites, o que torna os resultados comparáveis.
- **Tags `name` fixas** por endpoint: evitam alta cardinalidade de métricas e permitem thresholds por rota.
- **Checks validam status e corpo** (lista não vazia, `id === 1`, `accessToken` presente); status 200 sozinho não garante resposta correta.
- **Métrica `business_error_rate`** (Rate): falha de qualquer check, complementando `http_req_failed` (que só vê status HTTP ≥ 400/erros de rede).
- **Métrica `login_duration`** (Trend): isola a latência do endpoint de autenticação.
- **Think time** (`THINK_TIME`, 1s): usuários reais não disparam requisições sem pausa; sem ele, 500 VUs gerariam milhares de req/s irreais.
- **Ramp-up/ramp-down** no Load (`ramping-vus`): o platô de 500 VUs dura exatamente `LOAD_DURATION`; o ramp evita medir o pico artificial de abertura de conexões/TLS. Duração total ≈ 30s + 5m + 30s.
- **Credenciais de teste públicas** (`emilys` / `emilyspass`, documentadas pela DummyJSON), sobrescrevíveis por `AUTH_USERNAME`/`AUTH_PASSWORD`.

## Smoke Test

[tests/smoke.js](tests/smoke.js) — `constant-vus`, 10 VUs, 30s. Responde: *a API está no ar, o contrato básico funciona e os thresholds são atingíveis?* Se falhar, **não execute o Load**.

## Load Test

[tests/load.js](tests/load.js) — `ramping-vus`: 30s subindo até 500 VUs → 5m a 500 VUs → 30s descendo. Limites mais permissivos de média/p99 que o smoke, refletindo a contenção esperada sob carga.

## Parametrização

Todas via variáveis de ambiente (valores inválidos caem no default):

| Variável | Default | Descrição |
|---|---|---|
| `BASE_URL` | `https://dummyjson.com` | URL base da API |
| `SMOKE_VUS` | `10` | VUs do smoke |
| `SMOKE_DURATION` | `30s` | Duração do smoke |
| `LOAD_VUS` | `500` | VUs do load |
| `LOAD_DURATION` | `5m` | Duração do platô do load |
| `LOAD_RAMP_UP` / `LOAD_RAMP_DOWN` | `30s` | Rampa de subida/descida |
| `THINK_TIME` | `1` | Pausa (s) entre iterações |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | `emilys` / `emilyspass` | Credenciais do login |

```bash
LOAD_VUS=1000 LOAD_DURATION=10m k6 run tests/load.js
BASE_URL=https://staging.exemplo.com k6 run tests/smoke.js
```

## Métricas Monitoradas

| Requisito | Métrica K6 | Observação |
|---|---|---|
| Taxa de erro | `http_req_failed`, `business_error_rate` | HTTP/rede e checks |
| Throughput | `http_reqs` (rate) e `data_received`/`data_sent` | req/s e bytes/s |
| Requests por segundo | `http_reqs` (`/s`) | |
| Tempo médio | `http_req_duration` `avg` | |
| Mediana | `http_req_duration` `med` | |
| p95 / p99 | `http_req_duration` `p(95)` / `p(99)` | global e por `name` |
| Checks | `checks` | % de checks aprovados |
| Latência de login | `login_duration` | Trend custom |

## Thresholds

Definidos em [lib/thresholds.js](lib/thresholds.js).

| Threshold | Smoke | Load | Motivação |
|---|---|---|---|
| `http_req_failed` | `rate<0.01` | `rate<0.01` | SLO de disponibilidade: no máximo 1% de falhas HTTP/rede. |
| `business_error_rate` | `rate<0.01` | `rate<0.01` | Detecta respostas 200 porém incorretas (corpo inválido). |
| `checks` | `rate>0.99` | `rate>0.99` | Corretude funcional sob carga. |
| `http_req_duration avg` | `<500ms` | `<800ms` | Tendência central; sinaliza degradação geral. |
| `http_req_duration p(95)` | `<800ms` | `<1000ms` | Experiência da maioria; SLO principal de latência. |
| `http_req_duration p(99)` | `<1500ms` | `<2000ms` | Cauda longa: usuários mais afetados, enfileiramento/timeouts. |
| `http_req_duration{name:...} p(95)` | `<800ms` | `<1000ms` | Por endpoint, evita que uma rota lenta seja diluída na média. |

Os limites de latência são ponto de partida por serem uma API pública externa (latência de rede inclusa); ajuste à linha de base medida e ao SLO real. Se um threshold falhar, o K6 retorna exit code ≠ 0 — útil para CI.

## Execução

Pré-requisito: [instalar o K6](https://grafana.com/docs/k6/latest/set-up/install-k6/) (`brew install k6`).

```bash
k6 run tests/smoke.js
k6 run tests/load.js
```

Ao final, `handleSummary` grava automaticamente `reports/<teste>-summary.json` e `.txt`.

Opcional — métricas ponto a ponto para gráficos:

```bash
k6 run --out json=reports/load-metrics.json tests/load.js
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=docs/load-dashboard.html k6 run tests/load.js
```

## Evidências

Após executar de verdade, salve em [docs/](docs/):

1. **Resultado completo**: `k6 run tests/smoke.js 2>&1 | tee docs/smoke-result.txt` e idem para `load` (`docs/load-result.txt`). Copie também `reports/*-summary.json`.
2. **Screenshots da execução**: terminal durante e ao final (ex.: `docs/smoke-execucao.png`, `docs/load-execucao.png`), mostrando o ✓/✗ dos thresholds.
3. **Screenshots das métricas**: resumo final (http_req_duration, http_reqs, checks) e, se usar o dashboard web (`http://localhost:5665`), gráficos de VUs, req/s e latência (`docs/load-metricas.png`).

## Análise dos Resultados

### Como interpretar

- **Throughput / RPS** (`http_reqs`): requisições atendidas por segundo. Esperado ≈ `VUs × 3 req / (tempo de resposta + think time)`. Com 500 VUs e ~1,3s por iteração, o teto teórico é ~1.150 req/s. Se o RPS **estabiliza ou cai enquanto os VUs sobem**, o sistema saturou. Throughput menor que o esperado com latência alta indica gargalo no servidor/rede.
- **Error rate** (`http_req_failed`, `business_error_rate`, `checks`): deve ficar abaixo de 1%. Observe *quando* surgem: erros 429 indicam rate limit; 5xx, falha do servidor; timeouts/`connection reset`, saturação de rede ou do cliente. Erros crescendo com a carga marcam o ponto de ruptura.
- **p95**: 95% das requisições foram mais rápidas que esse valor; representa a experiência típica sob carga e é a base do SLO. Compare com a mediana: gap grande indica variabilidade.
- **p99**: a cauda. Distância grande entre p95 e p99 sugere enfileiramento, GC, retries, cold paths ou limites de conexão. Importante para SLAs rígidos.
- **Identificar gargalos**: (1) correlacione latência × VUs × RPS ao longo do tempo; (2) compare p95 **por endpoint** (`{name:...}`) para achar a rota culpada; (3) decomponha `http_req_duration` em `http_req_blocked`/`connecting`/`tls_handshaking` (rede/cliente), `http_req_waiting` (servidor/TTFB) e `http_req_receiving` (payload); (4) verifique CPU/rede da máquina geradora de carga para não confundir limite do cliente com limite da API.

### Resultados Reais

Execução com os parâmetros padrão (smoke: 10 VUs / 30s; load: 500 VUs / 5 min de carga efetiva) contra `https://dummyjson.com`.

| Métrica | Smoke | Load |
|---|---|---|
| Usuários virtuais | 10 | 500 |
| Duração | 30s | 5 min (+ rampas) |
| Requisições totais | n/d | 326.409 |
| Error Rate | 0,00% | 54,70% |
| Checks | 100% | n/d (ver `reports/load-summary.txt`) |
| Throughput | 19,38 req/s | 903,88 req/s |
| Tempo médio | 170,62 ms | n/d (ver `reports/load-summary.txt`) |
| P95 | 303,91 ms | 301,77 ms |
| P99 | 320,19 ms | 379,39 ms |
| Status | ✅ Aprovado | ❌ Reprovado (threshold de erro) |

Thresholds de latência (p95 < 800/1000 ms e p99 < 1500/2000 ms) foram atendidos nos dois testes; o que reprovou o Load foi a disponibilidade. `n/d` = valor não consolidado neste documento; consulte os arquivos gerados em `reports/`.

**Smoke Test.** Todas as requisições foram bem-sucedidas (0,00% de erro, 100% dos checks), com média de 170,62 ms, p95 de 303,91 ms e p99 de 320,19 ms, bem abaixo dos limites (500/800/1500 ms). A proximidade entre p95 e p99 (~16 ms) indica latência estável e sem cauda longa. O throughput de 19,38 req/s é coerente com 10 VUs, 3 requisições por iteração e think time de 1s. Ambiente, contrato dos endpoints e thresholds estão validados.

**Load Test.** Com 500 VUs, o teste gerou 326.409 requisições a 903,88 req/s, volume próximo do teto teórico estimado (~1.150 req/s), ou seja, o gerador de carga entregou a pressão planejada. Apesar disso, 54,70% das requisições falharam. `GET /users` permaneceu estável, enquanto `GET /users/1` e `POST /auth/login` apresentaram alta taxa de falhas. As latências permaneceram baixas (p95 301,77 ms; p99 379,39 ms), no mesmo patamar do smoke.

**Interpretação das métricas neste resultado**

- **Throughput:** 903,88 req/s comprova que a carga foi aplicada, mas é throughput *bruto*, que inclui respostas de erro. Respostas de falha tendem a ser rápidas e inflam o RPS; o throughput *útil* é aproximadamente a fração bem-sucedida (~45% das requisições).
- **Error rate:** 54,70% contra o limite de 1% é a evidência central: mais da metade das requisições não foi atendida corretamente sob 500 VUs, contra 0,00% com 10 VUs. A degradação é, portanto, função da concorrência.
- **P95 (301,77 ms):** 95% das requisições responderam em menos de ~302 ms, muito abaixo de 1000 ms. Atenção: o percentil considera também as respostas de erro, que costumam ser rápidas, e portanto pode mascarar a lentidão real das requisições bem-sucedidas.
- **P99 (379,39 ms):** a cauda também é curta (~78 ms acima do p95) e distante de 2000 ms: não há enfileiramento nem timeouts relevantes. O gargalo não aparece como lentidão.

## Gargalos Identificados

- **Por que os thresholds falharam.** O threshold de `http_req_failed` (`rate<0.01`) foi violado com 54,70%. Como `checks` e `business_error_rate` são calculados sobre as mesmas respostas, são afetados da mesma forma (valores exatos em `reports/load-summary.txt`). Os thresholds de latência (p95, p99) não foram a causa da reprovação.
- **Falha alta não significa lentidão.** Mecanismos de proteção (rate limiting, throttling, load shedding) rejeitam requisições imediatamente, com resposta curta e rápida. Isso explica latências baixas convivendo com erro alto. Olhar só p95/p99 aprovaria erroneamente um serviço que está recusando a maioria das chamadas.
- **Disponibilidade × performance.** Performance mede *quão rápido* o sistema responde; disponibilidade mede *se* responde corretamente. São dimensões independentes e ambas precisam de threshold: aqui a performance (latência) foi boa e a disponibilidade, ruim. Por isso o conjunto `http_req_failed` + `checks` + latência é necessário.
- **Padrão por endpoint.** Apenas `GET /users/1` e `POST /auth/login` falharam, enquanto `GET /users` permaneceu estável. Isso aponta para tratamento diferenciado por rota (por exemplo, limites distintos por endpoint ou proteção específica da autenticação), mas a causa exata não pôde ser confirmada com os dados coletados.
- **Impacto da API pública compartilhada.** A DummyJSON é um serviço de terceiros, compartilhado e fora do nosso controle. 500 VUs a partir de um único IP tendem a acionar limites de uso e proteções da plataforma, e não há acesso a métricas do servidor (CPU, logs, filas). A hipótese mais provável é **rate limiting, throttling ou limitação do ambiente compartilhado**; trata-se de hipótese, não de causa confirmada, pois os códigos de status das falhas não foram analisados neste relatório.

## Conclusões

- O **Smoke Test foi aprovado** e todos os seus thresholds foram atendidos (erro 0,00%, checks 100%, p95 303,91 ms, p99 320,19 ms).
- O **Load Test identificou um gargalo real**: sob 500 VUs, a API tornou-se indisponível para mais da metade das requisições (54,70%), em `GET /users/1` e `POST /auth/login`.
- A solução **detectou corretamente a degradação sob carga**: o threshold de erro reprovou a execução (exit code ≠ 0), e as métricas por endpoint e de latência permitiram distinguir falha de disponibilidade de lentidão.
- O **objetivo do teste foi atingido**: um teste de carga é bem-sucedido quando revela, de forma evidenciada, o comportamento do sistema sob estresse, mesmo que os thresholds reprovem.

## Evidências de Execução

Salve os screenshots abaixo em [docs/](docs/) (veja também a seção [Evidências](#evidências) para os arquivos de resultado completo):

```text
docs/smoke-test-result.png
docs/load-test-result.png
```

Se os arquivos existirem, as imagens abaixo serão exibidas (no estado atual do repositório, ainda não foram adicionadas):

![Resultado do Smoke Test](docs/smoke-test-result.png)

![Resultado do Load Test](docs/load-test-result.png)

## Avaliação Final

**Parecer técnico.**

- **O sistema suportou a carga?** Para 10 VUs, sim, com folga. Para 500 VUs, não: 54,70% das requisições falharam, ainda que as respostas tenham sido rápidas.
- **Os thresholds foram atingidos?** Smoke: todos. Load: os de latência (p95 e p99) sim; o de taxa de erro não, o que reprova o teste.
- **Foram encontrados gargalos?** Sim, de disponibilidade (não de latência), concentrados em `GET /users/1` e `POST /auth/login`, com `GET /users` estável. A hipótese mais provável é limitação por rate limiting/throttling do ambiente público compartilhado.
- **Recomendações para investigação futura:**
  1. Registrar a distribuição de status HTTP das falhas (429, 5xx, timeout) por endpoint para confirmar a causa.
  2. Executar degraus de carga (100, 200, 300, 400, 500 VUs) para localizar o ponto de ruptura.
  3. Repetir contra um ambiente próprio (local, Docker ou staging) para eliminar o rate limiting de terceiros e medir a capacidade real da aplicação.
  4. Testar a partir de múltiplos IPs/geradores para descartar limite por origem.
  5. Correlacionar com métricas de servidor (CPU, memória, conexões) quando houver acesso ao ambiente.
  6. Avaliar um threshold por endpoint também para taxa de erro.

## Possíveis Gargalos

- **Rate limiting/WAF** da API pública (429, resets) — o mais provável com 500 VUs a partir de um único IP.
- **Rede e latência geográfica** entre gerador e API (alto `http_req_blocked`/`connecting`).
- **Handshake TLS e limite de conexões** na subida de carga.
- **Payload de `GET /users`** (lista grande → `http_req_receiving`/banda).
- **Autenticação** (`POST /auth/login`): geração de token costuma ser mais custosa (observe `login_duration`).
- **Máquina geradora de carga**: CPU, descritores de arquivo (`ulimit -n`) e banda podem limitar o teste.
- **Infra compartilhada** da DummyJSON, sujeita a ruído de terceiros.

## Uso de IA

Este projeto foi estruturado com apoio de um assistente de IA (GitHub Copilot) para gerar a arquitetura, o código K6 e esta documentação. O código foi executado (smoke reduzido) para validar sintaxe e checks. Os resultados reais, evidências e a análise final devem ser produzidos e revisados por um engenheiro humano após a execução.
