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
 * O shape do item de reunião ainda NÃO foi confirmado — a lista voltou vazia
 * na Fase 0 porque o padrão é "My Meetings". Só `id` é garantido (a rota
 * /meetings/:id usa inteiro). O resto passa direto até vermos uma página cheia.
 */
export const meetingSummary = type({
  id: "number | string",
  "title?": "string | null",
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
