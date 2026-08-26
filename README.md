# salesbud-export

Cliente headless para extrair transcrições do Salesbud, que não tem API pública.

## Por que não é web scraping

O botão de download do app (`.txt` / `.docx`) é **100% client-side**: ele monta o
arquivo no navegador a partir de um JSON que a página já buscou. Não existe
endpoint de `.txt` no backend. Automatizar aquele clique seria subir um Chrome
para fazer uma concatenação de strings — e depois reparsear o resultado.

Este cliente vai direto à fonte:

```
GET /api/meetings?teamId=<id>         → lista de interações
GET /api/meetings/{id}/transcription  → { id, utterances[{ speaker, text, words[] }] }
```

Cada reunião gera dois arquivos, em pastas separadas:

```
out/txt/2026-08-20_Rennova_<>_Strattum_2679290.txt
out/json/2026-08-20_Rennova_<>_Strattum_2679290.json
```

O JSON sai **sem o `words[]`** — o timing palavra a palavra é ~95% do payload
(31 MB → 1.5 MB nas 28 reuniões) e raramente é o que se quer. O `.txt` continua
sendo gerado a partir do payload completo, antes do descarte: as palavras têm
precedência sobre `text`, então strippar antes mudaria o texto.

O `.txt` gerado corresponde à opção **"Original"** do seletor. A versão do
"Improve with AI" vive em `enhancedTranscript` e não é coberta.

## Segurança: GET-only

`src/http.ts` só sabe fazer GET. O mesmo padrão de URL usado para ler também
expõe escrita em produção (`/title`, `/tags`, `/send-bot`, `/restart-bot`,
`/override-no-show`), então a trava está no transporte, não numa convenção.

Transcrição de call é PII pesada: `out/`, `samples/`, `.env` e `.auth.json`
estão no `.gitignore`. Mantenha assim.

## Uso

```bash
cp .env.example .env    # preencha SALESBUD_EMAIL e SALESBUD_PASSWORD
bun install

bun run sync                    # baixa só as transcrições novas
bun run teams                   # lista os times (Strattum = 1685)
bun run export --limit 5        # começa pequeno
bun run export --status all     # inclui não-concluídas (sem transcrição)
bun run export --id 2679290     # uma só
bun run export --force          # rebaixa tudo
```

`sync` é o comando do dia a dia: lista as concluídas do time e baixa apenas as
que ainda não estão em disco. Rodar duas vezes seguidas não gera requisição de
transcrição nenhuma.

O time vem de `SALESBUD_TEAM_ID` no `.env` (ou `--team`).

**Só reuniões concluídas têm transcrição**, então `--status completed` é o
padrão. Os status foram confirmados contra o time 1685 (a soma bate com o
`itemCount` total, então a lista está completa):

| status | nome           | qtd | transcrição |
| ------ | -------------- | --- | ----------- |
| 3      | `completed`    | 28  | sim         |
| 4      | `didNotHappen` | 110 | não         |
| 1      | `scheduled`    | 11  | não         |
| 0      | `pending`      | 9   | não         |

**Sem `--team`, o backend responde no escopo "My Meetings"** e a lista volta
vazia. O filtro de time é o mesmo que o seletor "Team Strattum" do app aplica.

### Nomes dos arquivos

```
out/2026-08-20_Rennova_<>_Strattum_2679290.txt
```

`AAAA-MM-DD_Título_id.txt`, sem espaços. Quatro decisões por trás disso:

- **Sem espaços.** Todo espaço vira `_`, colapsado (nada de `__`).
- **Data em horário de Brasília.** `meetingAt` vem em UTC (`19:00Z` = `16:00`
  BRT); formatar em UTC jogaria reuniões noturnas para o dia seguinte.
- **O id no fim.** Título+data colidem nos dados reais (duas "Dry run Vivo" em
  2026-08-18). O id também é o índice do `sync` — não há manifesto separado.
- **`/` e `:` viram `-`.** O título "RJ / Marco" criaria uma subpasta.

Renomear é automático: ao encontrar um arquivo do esquema anterior, o `sync`
renomeia em vez de rebaixar a transcrição.

O resto da pontuação do título é preservado, então nomes como
`2026-07-10_[Salesbud_+_Strattum]_Follow-Up!_2165614.txt` ainda contêm
caracteres especiais de shell (`[]`, `!`, `<>`). Se atrapalhar em script, dá
para restringir a um conjunto mais conservador.

## Estado

Transcrição: **calibrada e verificada** contra uma resposta real (81 falas,
saída idêntica à do app).

Listagem: **calibrada**. Envelope (`meetings` / `hasMore` / `pageCount` /
`itemCount`), shape do item e enum de status confirmados contra respostas reais.
O backend limita a página a 30 itens independente do `limit` pedido.

Verificação: o `.txt` gerado é **byte-a-byte idêntico** ao baixado pelo botão do
app — mesmo sha256 (`6f3afdd…` para a reunião 2679290).

## Notas

- Auth é AWS Cognito SRP (`us-east-1_xZKJMtRws`), o mesmo fluxo do navegador,
  headless. Pool config é pública, vem do bundle. MFA não é suportado.
- Concorrência 2 e backoff exponencial: não há rate limit documentado.
