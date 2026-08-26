import { parseArgs } from "node:util";
import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { getText } from "./http";
import { getIdToken } from "./auth";
import { listMeetings, listTeams } from "./meetings";
import { fetchTranscript, toTxt } from "./transcript";
import { exportedIds, transcriptFileName } from "./naming";
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
    /** txt = só o arquivo final (padrão). both = guarda também a resposta crua. */
    format: { type: "string", default: "txt" },
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
  const keepJson = values.format === "both" || values.format === "json";
  const base = outDir();
  await mkdir(base, { recursive: true });

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

  // O disco é o índice: o id vive no nome do arquivo.
  const alreadyOnDisk = await exportedIds(base);
  let downloaded = 0;
  let renamed = 0;
  let skipped = 0;

  for (const meeting of meetings) {
    const fileName = transcriptFileName(meeting);
    const existing = alreadyOnDisk.get(meeting.id);

    if (existing && !values.force) {
      // Arquivo do esquema antigo (`<id>.txt`): renomeia em vez de rebaixar.
      if (existing !== fileName) {
        await rename(join(base, existing), join(base, fileName));
        renamed++;
        console.log(`↻ ${existing} → ${fileName}`);
      } else {
        skipped++;
      }
      continue;
    }

    try {
      const data = await fetchTranscript(meeting.id);
      // Só o .txt toca o disco por padrão; o JSON é descartado da memória.
      await Bun.write(join(base, fileName), toTxt(data.utterances));
      if (keepJson) {
        await Bun.write(
          join(base, fileName.replace(/\.txt$/, ".json")),
          JSON.stringify(data, null, 2),
        );
      }
      downloaded++;
      console.log(`✓ ${fileName} (${data.utterances.length} falas)`);
    } catch (error) {
      console.error(`✗ ${meeting.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const parts = [`${downloaded} nova(s)`];
  if (renamed) parts.push(`${renamed} renomeada(s)`);
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
  bun run export --format both     guarda também o JSON cru
  bun run export --force           rebaixa tudo, ignorando o que há em disco
  bun run calibrate <id>           regrava samples/
  bun run login                    força login novo`);
}
