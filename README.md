# salesbud-export

Cliente headless para extrair transcrições do Salesbud, que não tem API pública.

## Por que não é web scraping

O botão de download do app (`.txt` / `.docx`) é **100% client-side**: ele monta o
arquivo no navegador a partir de um JSON que a página já buscou. Não existe
endpoint de `.txt` no backend. Automatizar aquele clique seria subir um Chrome
para fazer uma concatenação de strings — e depois reparsear o resultado.

Este cliente vai direto à fonte:

```
GET /api/meetings                     → lista de interações
GET /api/meetings/{id}/transcription  → segmentos { speaker, text, words[] }
```

O JSON traz **mais** que o download manual: timing por palavra e speaker
separado, que o `.txt` achata. Ainda assim, `toTxt()` reproduz o `.txt` oficial
byte-a-byte para quem precisa do formato original.

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

# Fase 0 — grava respostas cruas para calibrar os schemas
bun run calibrate 2679290

# Export
bun run export --limit 5        # sempre comece pequeno
bun run export --id 2679290
bun run export                  # histórico completo
```

Saída em `out/<meeting-id>/` com `raw.json` + `transcript.txt`. Reruns pulam o
que já está no disco (`--force` ignora), então dá para interromper e retomar.

## Estado

Autenticação e transporte estão prontos. Os schemas em `src/schemas.ts` e a
paginação em `src/meetings.ts` foram **inferidos do bundle do app** e ainda não
foram confirmados contra uma resposta real — é para isso que serve
`bun run calibrate`. Rode-o primeiro e ajuste os schemas com o que voltar.

## Notas

- Auth é AWS Cognito SRP (`us-east-1_xZKJMtRws`), o mesmo fluxo do navegador,
  headless. Pool config é pública, vem do bundle. MFA não é suportado.
- Concorrência 2 e backoff exponencial: não há rate limit documentado.
