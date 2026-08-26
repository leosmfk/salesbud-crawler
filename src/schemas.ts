import { type } from "arktype";

/**
 * Schemas CALIBRADOS contra respostas reais (samples/, Fase 0).
 * Onde há `| null` ou `?`, é tolerância deliberada: a amostra veio limpa, mas
 * uma call ainda processando pode não ter tudo.
 */

const word = type({
  text: "string",
  start: "number",
  end: "number",
  "speaker?": "string | null",
});

/** O app chama de "segmento"; a API chama de utterance. Speaker já vem resolvido. */
export const utterance = type({
  text: "string | null",
  "speaker?": "string | null",
  "words?": word.array().or("null"),
  "start?": "number",
  "end?": "number",
});

export const transcription = type({
  id: "number",
  utterances: utterance.array(),
  /** Versão do "Improve with AI"; null quando só existe a Original. */
  "enhancedTranscript?": "unknown",
  "processingStatus?": "string | null",
});

export type Utterance = typeof utterance.infer;

/**
 * Status de reunião, confirmados empiricamente contra o time 1685
 * (0+1+3+4 = 158 = itemCount total, então a lista está completa):
 *   0  pendente ......  9
 *   1  agendada ..... 11   (todas no futuro, duration 0)
 *   3  concluída .... 28   ← as únicas que têm transcrição
 *   4  não aconteceu  110  (no-show / sem gravação)
 *
 * O filtro do app expõe só três estados: All, Completed, Did not happen.
 */
export const MEETING_STATUS = {
  pending: 0,
  scheduled: 1,
  completed: 3,
  didNotHappen: 4,
} as const;

export type MeetingStatusName = keyof typeof MEETING_STATUS;

/** Calibrado contra samples/meetings-list.json. Campos não usados passam direto. */
export const meetingSummary = type({
  id: "number",
  title: "string",
  status: "number",
  "customerName?": "string | null",
  "company?": "string | null",
  "meetingAt?": "string | null",
  "duration?": "number | null",
  "isNoShow?": "boolean",
  "+": "ignore",
});

export type MeetingSummary = typeof meetingSummary.infer;

/** Envelope confirmado: {"meetings":[],"pageCount":0,"itemCount":0,"hasMore":false} */
export const meetingsPage = type({
  meetings: meetingSummary.array(),
  "hasMore?": "boolean",
  "pageCount?": "number",
  "itemCount?": "number",
  "+": "ignore",
});

export type Transcription = typeof transcription.infer;
