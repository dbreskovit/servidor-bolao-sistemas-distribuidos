# 📋 Documentação

Base URL: `http://bolao.breskovit.cloud:8080`

Todos os endpoints públicos abaixo **não requerem autenticação**. O header opcional `X-Client-Id` identifica o cliente nos logs (ex: `cliente-python`, `cliente-java`).

---

## 1. GET `/api/` — Partida Atual

Retorna a partida ativa (`scheduled`) ou a mais recente finalizada.

### Requisição

```bash
curl -X GET "http://bolao.breskovit.cloud:8080/api/" \
  -H "X-Client-Id: cliente-python"
```

### Resposta 200 OK

```json
{
  "id": 7,
  "team_a": {
    "name": "Brasil",
    "flag": "🇧🇷"
  },
  "team_b": {
    "name": "Japão",
    "flag": "🇯🇵"
  },
  "kickoff_at": "2026-06-29T17:00:00.000Z",
  "status": "scheduled"
}
```

### Resposta 404 Not Found

Quando não há nenhuma partida cadastrada:

```json
{
  "error": "no matches"
}
```

---

## 2. GET `/api/matches` — Lista de Partidas

Retorna todas as partidas em ordem cronológica (kickoff_at ascendente).

### Requisição

```bash
curl -X GET "http://bolao.breskovit.cloud:8080/api/matches" \
  -H "X-Client-Id: cliente-java"
```

### Resposta 200 OK

```json
[
  {
    "id": 1,
    "team_a": {
      "name": "Brasil",
      "flag": "🇧🇷"
    },
    "team_b": {
      "name": "Argentina",
      "flag": "🇦🇷"
    },
    "kickoff_at": "2026-06-10T18:00:00.000Z",
    "status": "finished",
    "real_score": {
      "a": 3,
      "b": 1
    }
  },
  {
    "id": 7,
    "team_a": {
      "name": "Brasil",
      "flag": "🇧🇷"
    },
    "team_b": {
      "name": "Japão",
      "flag": "🇯🇵"
    },
    "kickoff_at": "2026-06-29T17:00:00.000Z",
    "status": "scheduled"
  }
]
```

**Nota:** Partidas finalizadas incluem o campo `real_score`.

---

## 3. GET `/api/matches/:id` — Uma Partida

Retorna uma partida específica pelo ID.

### Requisição

```bash
curl -X GET "http://bolao.breskovit.cloud:8080/api/matches/7"
```

### Resposta 200 OK

```json
{
  "id": 7,
  "team_a": {
    "name": "Brasil",
    "flag": "🇧🇷"
  },
  "team_b": {
    "name": "Japão",
    "flag": "🇯🇵"
  },
  "kickoff_at": "2026-06-29T17:00:00.000Z",
  "status": "scheduled"
}
```

### Resposta 404 Not Found

Quando o ID não existe:

```json
{
  "error": "match not found"
}
```

---

## 4. POST `/api/match?id=:id` — Cadastrar/Atualizar Palpite

Cria um novo palpite ou atualiza um existente (upsert por match_id + username).

### Requisição

```bash
curl -X POST "http://bolao.breskovit.cloud:8080/api/match?id=7" \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: cliente-csharp" \
  -d '{
    "username": "joao",
    "score_a": 2,
    "score_b": 1
  }'
```

### Body Esperado

```json
{
  "username": "joao",
  "score_a": 2,
  "score_b": 1
}
```

**Campos:**
- `username` (string, obrigatório): nome do usuario (não vazio)
- `score_a` (integer, obrigatório): placar do time A (>= 0)
- `score_b` (integer, obrigatório): placar do time B (>= 0)
- `timestamp` (string, opcional): ignorado pelo servidor (usa `now()`)

### Resposta 200 OK (Criado)

```json
{
  "id": 42,
  "match_id": 7,
  "username": "joao",
  "score_a": 2,
  "score_b": 1,
  "updated_at": "2026-06-28T14:30:00.000Z"
}
```

### Resposta 200 OK (Atualizado)

Se o mesmo username já tinha um palpite nesta partida, ele é atualizado:

```json
{
  "id": 42,
  "match_id": 7,
  "username": "joao",
  "score_a": 3,
  "score_b": 2,
  "updated_at": "2026-06-28T15:45:00.000Z"
}
```

### Resposta 400 Bad Request

Campos inválidos:

```json
{
  "error": "username is required"
}
```

Outros casos:
- Score negativo
- Username vazio
- Tipos de dados inválidos

### Resposta 404 Not Found

Partida não existe:

```json
{
  "error": "match not found"
}
```

### Resposta 409 Conflict

A partida já foi finalizada (não pode palpitar depois que o resultado foi registrado):

```json
{
  "error": "match already finished"
}
```

---

## 5. GET `/api/ranking` — Ranking Geral

Retorna o ranking de usuários ordenado por pontos (descendente) e username (ascendente).

### Requisição

```bash
curl -X GET "http://bolao.breskovit.cloud:8080/api/ranking" \
  -H "X-Client-Id: cliente-golang"
```

### Resposta 200 OK

```json
[
  {
    "ranking": 1,
    "username": "joao",
    "points": 25.0
  },
  {
    "ranking": 2,
    "username": "ana",
    "points": 15.0
  },
  {
    "ranking": 2,
    "username": "maria",
    "points": 15.0
  },
  {
    "ranking": 4,
    "username": "pedro",
    "points": 5.0
  }
]
```

**Nota:** Usa **ranking de competição** (1,2,2,4...). Apenas palpites de partidas finalizadas são contabilizados (pontos null são tratados como 0).

**Pontuação:**
- Placar exato = 10 pontos
- Acertou vencedor/empate = 5 pontos
- Errou = 0 pontos

---

## 6. GET `/api/countries` — Lista de Países

Retorna os 48 países da Copa 2026 com bandeira emoji.

### Requisição

```bash
curl -X GET "http://bolao.breskovit.cloud:8080/api/countries"
```

### Resposta 200 OK

```json
[
  {
    "name": "Brasil",
    "iso2": "BR",
    "flag": "🇧🇷"
  },
  {
    "name": "Argentina",
    "iso2": "AR",
    "flag": "🇦🇷"
  },
  {
    "name": "Japão",
    "iso2": "JP",
    "flag": "🇯🇵"
  },
  {
    "name": "Portugal",
    "iso2": "PT",
    "flag": "🇵🇹"
  },
  {
    "name": "Espanha",
    "iso2": "ES",
    "flag": "🇪🇸"
  },
  {
    "name": "França",
    "iso2": "FR",
    "flag": "🇫🇷"
  },
  {
    "name": "Alemanha",
    "iso2": "DE",
    "flag": "🇩🇪"
  }
]
```

**Total:** 48 países (incluindo 3 anfitriões + confederações AFC, CAF, Concacaf, CONMEBOL, OFC, UEFA)

---

## Resumo de Erros Possíveis

| Erro | Status | Causas |
|------|--------|--------|
| `no matches` | 404 | Nenhuma partida cadastrada |
| `match not found` | 404 | ID de partida não existe |
| `username is required` | 400 | Username vazio ou nulo |
| `match already finished` | 409 | Tentou palpitar em partida finalizada |
| (validation errors) | 400 | Score negativo, tipos inválidos, etc |

---

## Headers Opcionais

| Header | Uso | Exemplo |
|--------|-----|---------|
| `X-Client-Id` | Identifica cliente nos logs | `cliente-python`, `cliente-java` |
| `Content-Type` | POST/PUT (sempre application/json) | `application/json` |