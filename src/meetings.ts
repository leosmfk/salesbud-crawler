import { type } from "arktype";
import { getJson } from "./http";
import {
  MEETING_STATUS,
  meetingsPage,
  type MeetingStatusName,
  type MeetingSummary,
} from "./schemas";

/**
 * Listagem de reuniões.
 *
 * A query foi extraída do próprio app (RTK Query, bundle index-*.js):
 *   limit, page, teamId, teamIds[], scope, sharedWithMe, status,
 *   meetingType, mediaType, query, startDate, endDate, minRating, maxRating, tagId
 *
 * Sem `teamId` o backend responde no escopo "My Meetings" e a lista vem vazia.
 */

export type ListFilters = {
  /** Ex.: 1685 = Strattum. Obrigatório na prática. */
  teamId?: string;
  /** `undefined` = todos os status. Só `completed` tem transcrição. */
  status?: MeetingStatusName;
  limit?: number;
};

/** O backend ignora `limit` acima disto e devolve 30 de qualquer forma. */
const PAGE_SIZE = 30;

/** Trava de sanidade contra um `hasMore` que nunca vira false. */
const MAX_PAGES = 200;

const fetchPage = async (page: number, filters: ListFilters) => {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    page: String(page),
    ...(filters.teamId ? { teamId: filters.teamId } : {}),
    ...(filters.status ? { status: String(MEETING_STATUS[filters.status]) } : {}),
  });

  const parsed = meetingsPage(await getJson(`/api/meetings?${params}`));
  if (parsed instanceof type.errors) {
    throw new Error(`Lista de reuniões fora do schema: ${parsed.summary}`);
  }
  return parsed;
};

/** Percorre as páginas usando o `hasMore` que a própria API devolve. */
export const listMeetings = async (filters: ListFilters = {}): Promise<MeetingSummary[]> => {
  const collected: MeetingSummary[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { meetings, hasMore } = await fetchPage(page, filters);
    if (meetings.length === 0) break;

    for (const meeting of meetings) {
      collected.push(meeting);
      if (filters.limit && collected.length >= filters.limit) return collected;
    }
    if (!hasMore) break;
  }

  return collected;
};

/** Times visíveis ao usuário — use para descobrir o teamId. */
export const listTeams = async (): Promise<unknown> => getJson("/api/teams");
