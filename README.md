# salesbud-crawler

Cliente headless que baixa transcrições e metadados de reuniões do Salesbud, que
não tem API pública.

## Uso

```bash
cp .env.example .env    # SALESBUD_EMAIL, SALESBUD_PASSWORD, SALESBUD_TEAM_ID
bun install

bun run sync                    # baixa só o que ainda não está em disco
bun run teams                   # lista os times, para achar o SALESBUD_TEAM_ID
bun run export --limit 5        # começa pequeno
bun run export --id 2679290     # uma reunião
bun run export --status all     # inclui não-concluídas (não têm transcrição)
bun run export --force          # rebaixa tudo
```

`sync` é o comando do dia a dia. O id da reunião vive no nome do arquivo, então
o disco é o índice: rodar duas vezes seguidas não gera requisição nenhuma.

## Saída

Três arquivos por reunião, mesmo nome, pastas separadas:

```
out/txt/2026-08-20_Rennova_<>_Strattum_2679290.txt     transcrição
out/json/2026-08-20_Rennova_<>_Strattum_2679290.json   falas com timing
out/info/2026-08-20_Rennova_<>_Strattum_2679290.md     título, data, duração,
                                                       organizador, rating,
                                                       classificações,
                                                       convidados, resumo
```

O `.txt` é byte-a-byte idêntico ao download do app e corresponde à opção
**"Original"**; a versão "Improve with AI" vive em `enhancedTranscript` e não é
coberta.

O `.json` sai **sem `words[]`** — o timing palavra a palavra é ~95% do payload.
O `.txt` é gerado antes do descarte, porque as palavras têm precedência sobre
`text` na montagem do arquivo.

**Nem toda reunião tem resumo.** O template pertence a um usuário; os de outras
pessoas respondem `403 TEMPLATE_ACCESS_DENIED` e a ficha sai com a seção de
resumo vazia. `/api/templates` lista os que sua conta acessa.

### Nomes

`AAAA-MM-DD_Título_id.txt`, sem espaços.

- Data em horário de Brasília — `meetingAt` vem em UTC, e formatar em UTC
  jogaria reuniões noturnas para o dia seguinte.
- Id no fim: título+data colidem (duas "Dry run Vivo" em 2026-08-18).
- `/` e `:` viram `-`; o resto da pontuação é preservada, então nomes podem
  conter `[]`, `!` e `<>`.

Arquivos de esquemas anteriores são renomeados no lugar, sem rebaixar nada.

## Filtros

Só reuniões concluídas têm transcrição, então `--status completed` é o padrão:

| status | nome           | transcrição |
| ------ | -------------- | ----------- |
| 3      | `completed`    | sim         |
| 4      | `didNotHappen` | não         |
| 1      | `scheduled`    | não         |
| 0      | `pending`      | não         |

Sem time definido, o backend responde no escopo "My Meetings" e a lista volta
vazia. Use `SALESBUD_TEAM_ID` ou `--team`.

## Endpoints

```
GET /api/teams
GET /api/meetings?teamId=<id>&status=<n>&page=<n>&limit=30
GET /api/meetings/{id}/transcription
GET /api/meetings/admin/load/template?meetingId=<id>&templateId=<id>
```

O backend limita a página a 30 itens independente do `limit` pedido; a
paginação segue o `hasMore` da resposta.

## Notas

- **GET-only.** `src/http.ts` não sabe fazer outro método. O mesmo padrão de URL
  expõe escrita em produção (`/title`, `/tags`, `/send-bot`, `/restart-bot`),
  então a trava está no transporte, não numa convenção.
- **PII.** Transcrição de call é dado sensível: `out/`, `samples/`, `.env` e
  `.auth.json` estão no `.gitignore`. Mantenha assim.
- Auth é AWS Cognito SRP (`us-east-1_xZKJMtRws`), o mesmo fluxo do navegador,
  headless. A config do pool é pública, vem do bundle. MFA não é suportado.
- Concorrência 2 e backoff exponencial: não há rate limit documentado.
