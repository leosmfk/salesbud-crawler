import { parseArgs } from "node:util";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getText } from "./http";
import { getIdToken } from "./auth";
import { listMeetings, listTeams } from "./meetings";
import { fetchTranscript, toTxt } from "./transcript";
import { SAMPLES_DIR, outDir } from "./config";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    id: { type: "string" },
    team: { type: "string" },
    limit: { type: "string" },
    /** txt = só o arquivo final (padrão). json = também guarda a resposta crua. */
    format: { type: "string", default: "txt" },
    force: { type: "boolean", default: false },
  },
});

const command = positionals[0] ?? "help";

/** Fase 0: não interpreta nada, só registra a verdade para calibrarmos em cima. */
const calibrate = async (meetingId: string) => {
  await mkdir(SAMPLES_DIR, { recursive: true });
  const team = values.team ? `&teamId=${values.team}` : "";

  const targets = [
    { name: "teams.json", path: "/api/teams" },
    { name: "meetings-list.json", path: `/api/meetings?limit=50&page=1${team}` },
    { name: `transcription-${meetingId}.json`, path: `/api/meetings/${meetingId}/transcription` },
  ] as const;

  for (const target of targets) {
    try {
      const body = await getText(target.path);
      await Bun.write(join(SAMPLES_DIR, target.name), body);
      console.log(`✓ ${target.path} → ${SAMPLES_DIR}/${target.name} (${body.length} bytes)`);
      console.log(`  topo: ${body.slice(0, 300)}\n`);
    } catch (error) {
      console.error(`✗ ${target.path}: ${error instanceof Error ? error.message : error}`);
    }
  }
};

const exportTranscripts = async () => {
  const limit = values.limit ? Number(values.limit) : undefined;
  const keepJson = values.format === "json" || values.format === "both";

  const ids = values.id
    ? [values.id]
    : (await listMeetings({ teamId: values.team, limit })).map((m) => String(m.id));

  if (ids.length === 0) {
    console.log(
      "Nenhuma reunião. Sem --team o escopo é 'My Meetings' — rode `bun run teams` para achar o id do Strattum.",
    );
    return;
  }

  console.log(`${ids.length} reunião(ões) para exportar.`);
  const base = outDir();
  await mkdir(base, { recursive: true });
  let done = 0;
  let skipped = 0;

  for (const id of ids) {
    const txtPath = join(base, `${id}.txt`);
    // Idempotente: rerun não rebate na API para o que já está no disco.
    if (!values.force && (await Bun.file(txtPath).exists())) {
      skipped++;
      continue;
    }

    try {
      const data = await fetchTranscript(id);
      // Só o .txt toca o disco por padrão. O JSON é descartado da memória.
      await Bun.write(txtPath, toTxt(data.utterances));
      if (keepJson) await Bun.write(join(base, `${id}.json`), JSON.stringify(data, null, 2));
      done++;
      console.log(`✓ ${id}.txt (${data.utterances.length} falas)`);
    } catch (error) {
      console.error(`✗ ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\nPronto: ${done} exportada(s), ${skipped} já existente(s) em ${base}/`);
};

switch (command) {
  case "calibrate": {
    const id = values.id ?? positionals[1];
    if (!id) throw new Error("Uso: bun run calibrate <meetingId>  (ex.: 2679290)");
    await calibrate(id);
    break;
  }
  case "teams":
    console.log(JSON.stringify(await listTeams(), null, 2));
    break;
  case "export":
    await exportTranscripts();
    break;
  case "login":
    await getIdToken(true);
    console.log("✓ Login OK, token em cache.");
    break;
  default:
    console.log(`Uso:
  bun run teams                        lista os times (pegue o id do Strattum)
  bun run export --team <id>           exporta os .txt do time
  bun run export --team <id> --limit 5 começa pequeno
  bun run export --id 2679290          exporta uma só
  bun run export --format both         guarda também o JSON cru
  bun run calibrate <id> [--team <id>] regrava samples/
  bun run login                        força login novo`);
}
