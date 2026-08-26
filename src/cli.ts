import { parseArgs } from "node:util";
import { mkdir, rename } from "node:fs/promises";
import { join, relative } from "node:path";
import { getText } from "./http";
import { getIdToken } from "./auth";
import { listMeetings, listTeams } from "./meetings";
import { fetchTranscript, toTxt, withoutWords } from "./transcript";
import { existingTranscripts, transcriptFileName } from "./naming";
import { MEETING_STATUS, type MeetingStatusName } from "./schemas";
import { SAMPLES_DIR, defaultTeamId, outDir } from "./config";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    id: { type: "string" },
    team: { type: "string" },
    /** Só `completed` tem transcrição — por isso é o padrão. */
    status: { type: "string", default: "completed" },
    limit: { type: "string" },
    force: { type: "boolean", default: false },
  },
});

const command = positionals[0] ?? "help";

const isStatusName = (value: string): value is MeetingStatusName => value in MEETING_STATUS;

/** "all" desliga o filtro; qualquer outro valor precisa existir no enum. */
const statusFilter = (): MeetingStatusName | undefined => {
  const raw = values.status ?? "completed";
  if (raw === "all") return undefined;
  if (!isStatusName(raw)) {
    throw new Error(
      `--status inválido: ${raw}. Use all, ${Object.keys(MEETING_STATUS).join(", ")}.`,
    );
  }
  return raw;
};

const teamId = () => values.team ?? defaultTeamId();

/** Fase 0: não interpreta nada, só registra a verdade para calibrarmos em cima. */
const calibrate = async (meetingId: string) => {
  await mkdir(SAMPLES_DIR, { recursive: true });
  const team = teamId() ? `&teamId=${teamId()}` : "";

  const targets = [
    { name: "teams.json", path: "/api/teams" },
    { name: "meetings-list.json", path: `/api/meetings?limit=30&page=1${team}` },
    { name: `transcription-${meetingId}.json`, path: `/api/meetings/${meetingId}/transcription` },
  ] as const;

  for (const target of targets) {
    try {
      const body = await getText(target.path);
      await Bun.write(join(SAMPLES_DIR, target.name), body);
      console.log(`✓ ${target.path} → ${SAMPLES_DIR}/${target.name} (${body.length} bytes)`);
    } catch (error) {
      console.error(`✗ ${target.path}: ${error instanceof Error ? error.message : error}`);
    }
  }
};

const exportTranscripts = async () => {
  const limit = values.limit ? Number(values.limit) : undefined;
  const base = outDir();
  const txtDir = join(base, "txt");
  const jsonDir = join(base, "json");
  await mkdir(txtDir, { recursive: true });
  await mkdir(jsonDir, { recursive: true });

  const meetings = await listMeetings({
    teamId: teamId(),
    status: statusFilter(),
    limit,
    ...(values.id ? { onlyId: Number(values.id) } : {}),
  });

  if (meetings.length === 0) {
    console.log(
      teamId()
        ? "Nenhuma reunião com esse filtro."
        : "Sem time definido: o escopo vira 'My Meetings'. Use --team ou SALESBUD_TEAM_ID.",
    );
    return;
  }

  // O disco é o índice: o id vive no nome do arquivo. A raiz entra na varredura
  // para migrar o que versões anteriores gravaram fora de out/txt/.
  const onDisk = await existingTranscripts([base, txtDir]);
  let downloaded = 0;
  let moved = 0;
  let skipped = 0;

  for (const meeting of meetings) {
    const txtPath = join(txtDir, transcriptFileName(meeting, "txt"));
    const jsonPath = join(jsonDir, transcriptFileName(meeting, "json"));

    // Nome ou pasta antigos: move em vez de rebaixar a transcrição. Um ENOENT
    // aqui significa que o arquivo já saiu do lugar — não é motivo para abortar
    // o run inteiro e perder as reuniões seguintes.
    const previous = onDisk.get(meeting.id);
    if (previous && previous !== txtPath && !values.force) {
      try {
        await rename(previous, txtPath);
        moved++;
        console.log(`↻ ${relative(base, previous)} → ${relative(base, txtPath)}`);
      } catch (error) {
        console.error(`  (não movi ${relative(base, previous)}: ${error instanceof Error ? error.message : error})`);
      }
    }

    const [hasTxt, hasJson] = await Promise.all([
      Bun.file(txtPath).exists(),
      Bun.file(jsonPath).exists(),
    ]);
    if (hasTxt && hasJson && !values.force) {
      skipped++;
      continue;
    }

    try {
      const data = await fetchTranscript(meeting.id);
      // O .txt sai do payload completo; o words[] só é descartado depois disso.
      await Bun.write(txtPath, toTxt(data.utterances));
      await Bun.write(jsonPath, JSON.stringify(withoutWords(data), null, 2));
      downloaded++;
      console.log(`✓ ${transcriptFileName(meeting, "txt")} (${data.utterances.length} falas)`);
    } catch (error) {
      console.error(`✗ ${meeting.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const parts = [`${downloaded} baixada(s)`];
  if (moved) parts.push(`${moved} movida(s)`);
  if (skipped) parts.push(`${skipped} já em dia`);
  console.log(`\n${parts.join(", ")} em ${base}/`);
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
  bun run sync                     baixa só as transcrições novas
  bun run teams                    lista os times (Strattum = 1685)

  bun run export --limit 5         começa pequeno
  bun run export --status all      inclui não-concluídas (sem transcrição)
  bun run export --id 2679290      uma só
  bun run export --force           rebaixa tudo, ignorando o que há em disco
  bun run calibrate <id>           regrava samples/
  bun run login                    força login novo`);
}
