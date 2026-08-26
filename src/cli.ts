import { parseArgs } from "node:util";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getText } from "./http";
import { getIdToken } from "./auth";
import { listMeetings } from "./meetings";
import { fetchTranscript, toTxt } from "./transcript";
import { SAMPLES_DIR, outDir } from "./config";

/**
 * Comandos:
 *   calibrate <id>  Fase 0 — grava respostas cruas em samples/ para fixar os schemas
 *   export          baixa transcrições (use --limit num primeiro run)
 *   login           força login novo, descartando o cache
 */

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    id: { type: "string" },
    limit: { type: "string" },
    format: { type: "string", default: "both" },
    force: { type: "boolean", default: false },
  },
});

const command = positionals[0] ?? "help";

/** Fase 0: não interpreta nada, só registra a verdade para calibrarmos em cima. */
const calibrate = async (meetingId: string) => {
  await mkdir(SAMPLES_DIR, { recursive: true });

  const targets = [
    { name: "meetings-list.json", path: "/api/meetings?page=1" },
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
  console.log("Fase 0 concluída. Me mostre o samples/ para eu fixar os schemas.");
};

const exportTranscripts = async () => {
  const limit = values.limit ? Number(values.limit) : undefined;
  const format = values.format ?? "both";

  const ids = values.id
    ? [values.id]
    : (await listMeetings(limit)).map((m) => String(m.id));

  console.log(`${ids.length} reunião(ões) para exportar.`);
  const base = outDir();
  let done = 0;
  let skipped = 0;

  for (const id of ids) {
    const dir = join(base, id);
    // Idempotente: rerun não rebate na API para o que já está no disco.
    if (!values.force && (await Bun.file(join(dir, "raw.json")).exists())) {
      skipped++;
      continue;
    }

    try {
      const { raw, segments } = await fetchTranscript(id);
      await mkdir(dir, { recursive: true });
      if (format !== "txt") await Bun.write(join(dir, "raw.json"), JSON.stringify(raw, null, 2));
      if (format !== "json") await Bun.write(join(dir, "transcript.txt"), toTxt(segments));
      done++;
      console.log(`✓ ${id} (${segments.length} segmentos)`);
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
  case "export":
    await exportTranscripts();
    break;
  case "login":
    await getIdToken(true);
    console.log("✓ Login OK, token em cache.");
    break;
  default:
    console.log(`Uso:
  bun run calibrate <id>              Fase 0 — grava respostas cruas em samples/
  bun run export [--limit N]          exporta transcrições
  bun run export --id 2679290         exporta uma só
  bun run export --format txt|json    padrão: both
  bun run login                       força login novo`);
}
