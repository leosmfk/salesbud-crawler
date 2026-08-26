import { type } from "arktype";
import { getJson } from "./http";
import { meetingsPage, type MeetingSummary } from "./schemas";

/**
 * Listagem de reuniões.
 *
 * A query foi extraída do próprio app (RTK Query, bundle index-*.js):
 *   limit, page, teamId, teamIds[], scope, sharedWithMe, status,
 *   meetingType, mediaType, query, startDate, endDate, minRating, maxRating, tagId
 *
 * Sem `teamId`, o backend responde no escopo "My Meetings" — foi por isso que a
 * Fase 0 voltou com `{"meetings":[],"itemCount":0}`.
 */

export type ListFilters = {
  /** Ex.: o time Strattum. Sem isto, você recebe só as suas próprias reuniões. */
  teamId?: string;
  status?: string;
  limit?: number;
};

const PAGE_SIZE = 50;

const fetchPage = async (page: number, filters: ListFilters) => {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    page: String(page),
    ...(filters.teamId ? { teamId: filters.teamId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
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

/** Times visíveis ao usuário — use para descobrir o teamId do Strattum. */
export const listTeams = async (): Promise<unknown> => getJson("/api/teams");

/** Trava de sanidade contra um `hasMore` que nunca vira false. */
const MAX_PAGES = 200;
