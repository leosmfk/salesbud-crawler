import { readdir } from "node:fs/promises";
import type { MeetingSummary } from "./schemas";

/**
 * Nome de arquivo das transcrições: `AAAA-MM-DD - Título - id.txt`
 *
 * O id no fim não é decoração: título+data colidem de verdade nos dados reais
 * (duas "Dry run Vivo" em 2026-08-18) e é ele que identifica o que já foi
 * baixado, dispensando um manifesto à parte.
 */

/** `meetingAt` vem em UTC; o app exibe em horário de Brasília. */
const TIMEZONE = "America/Sao_Paulo";

/**
 * Só o que quebra caminho: `/` criaria subpasta (existe o título "RJ / Marco")
 * e `:` confunde o Finder. Espaços e o resto da pontuação ficam como estão —
 * o nome tem que continuar parecido com o que o app mostra.
 * Quebras de linha caem no `\s+` logo abaixo.
 */
const sanitizeTitle = (title: string) =>
  title
    .replace(/[/\\:]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/** en-CA formata como AAAA-MM-DD, que ordena alfabeticamente. */
const isoDay = (meetingAt: string) =>
  new Date(meetingAt).toLocaleDateString("en-CA", { timeZone: TIMEZONE });

export const transcriptFileName = (meeting: MeetingSummary): string => {
  const day = meeting.meetingAt ? isoDay(meeting.meetingAt) : "sem-data";
  return `${day} - ${sanitizeTitle(meeting.title)} - ${meeting.id}.txt`;
};

/** Lê o id do fim do nome. Também reconhece o esquema antigo (`<id>.txt`). */
export const idFromFileName = (fileName: string): number | null => {
  const match = /(\d+)\.txt$/.exec(fileName);
  return match ? Number(match[1]) : null;
};

/** Ids já exportados, deduzidos dos próprios arquivos em disco. */
export const exportedIds = async (dir: string): Promise<Map<number, string>> => {
  const found = new Map<number, string>();
  const entries = await readdir(dir).catch(() => [] as string[]);

  for (const entry of entries) {
    const id = idFromFileName(entry);
    if (id !== null) found.set(id, entry);
  }
  return found;
};
