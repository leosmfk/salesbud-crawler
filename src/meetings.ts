import { type } from "arktype";
import { getJson } from "./http";
import { meetingSummary, unwrap, type MeetingSummary } from "./schemas";

/** Envelopes plausíveis para a lista de reuniões. Fixado na Fase 0. */
const LIST_KEYS = ["data", "items", "meetings", "results", "content"] as const;

/**
 * Uma página de /api/meetings. A paginação real (page/offset/cursor) ainda não
 * foi confirmada — `listMeetings` tenta o parâmetro mais comum e para assim que
 * uma página vem vazia ou repete IDs já vistos, o que é seguro em qualquer
 * dos três esquemas.
 */
const fetchPage = async (page: number): Promise<MeetingSummary[]> => {
  const payload = await getJson(`/api/meetings?page=${page}`);
  const list = unwrap(payload, LIST_KEYS);

  const parsed = meetingSummary.array()(list);
  if (parsed instanceof type.errors) {
    throw new Error(`Lista de reuniões fora do schema: ${parsed.summary}`);
  }
  return parsed;
};

/**
 * Percorre as páginas até acabar. `limit` corta cedo — use sempre num primeiro
 * run, antes de puxar o histórico inteiro.
 */
export const listMeetings = async (limit?: number): Promise<MeetingSummary[]> => {
  const collected: MeetingSummary[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await fetchPage(page);
    if (batch.length === 0) break;

    const fresh = batch.filter((m) => !seen.has(String(m.id)));
    // Página repetida = o parâmetro `page` foi ignorado pelo backend.
    if (fresh.length === 0) break;

    for (const meeting of fresh) {
      seen.add(String(meeting.id));
      collected.push(meeting);
      if (limit && collected.length >= limit) return collected;
    }
  }

  return collected;
};

/** Trava de sanidade: sem paginação confirmada, não varremos indefinidamente. */
const MAX_PAGES = 200;
