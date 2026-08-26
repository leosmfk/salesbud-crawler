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

Por padrão **só o `.txt` toca o disco** — o JSON é apenas o transporte, exatamente
como no navegador, e é descartado da memória. Use `--format both` se quiser
guardar também a resposta crua (que traz timing por palavra, algo que o `.txt`
achata).

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

bun run teams                          # descubra o id do time Strattum
bun run export --team <id> --limit 5   # sempre comece pequeno
bun run export --team <id>             # histórico do time
bun run export --id 2679290            # uma só
```

**Sem `--team`, o backend responde no escopo "My Meetings"** e a lista volta
vazia. O filtro de time é o mesmo que o seletor "Team Strattum" do app aplica.

Saída em `out/<meeting-id>.txt`. Reruns pulam o que já está no disco (`--force`
ignora), então dá para interromper e retomar.

## Estado

Transcrição: **calibrada e verificada** contra uma resposta real (81 falas,
saída idêntica à do app).

Listagem: o envelope (`meetings` / `hasMore` / `pageCount`) está confirmado, mas
o **shape do item de reunião ainda não** — a Fase 0 voltou vazia por causa do
escopo. `meetingSummary` só exige `id` até vermos uma página cheia.

## Notas

- Auth é AWS Cognito SRP (`us-east-1_xZKJMtRws`), o mesmo fluxo do navegador,
  headless. Pool config é pública, vem do bundle. MFA não é suportado.
- Concorrência 2 e backoff exponencial: não há rate limit documentado.
