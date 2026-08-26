import { type } from "arktype";

/**
 * Schemas INFERIDOS do bundle do app — ainda não calibrados contra uma resposta
 * real (isso é a Fase 0: `bun run calibrate <id>`). São deliberadamente
 * permissivos nos campos que não consegui confirmar, e estritos no que o código
 * do app comprovadamente usa: `speaker`, `text` e `words[].text`.
 *
 * Fonte: assets/TranscriptTab-*.js
 *   const words = seg.words || [];
 *   const text  = words.length ? words.map(w => w.text).join(" ") : seg.text || "";
 */

export const transcriptWord = type({
  text: "string",
  "start?": "number | null",
  "end?": "number | null",
  "+": "ignore",
});

export const transcriptSegment = type({
  "speaker?": "string | number | null",
  "text?": "string | null",
  "words?": transcriptWord.array().or("null"),
  "+": "ignore",
});

export const transcriptSegments = transcriptSegment.array();

export type TranscriptSegment = typeof transcriptSegment.infer;

/** IDs de reunião são inteiros (ex.: /meetings/2679290). */
export const meetingSummary = type({
  id: "number | string",
  "title?": "string | null",
  "date?": "string | null",
  "createdAt?": "string | null",
  "+": "ignore",
});

export type MeetingSummary = typeof meetingSummary.infer;

/**
 * A resposta pode vir como array puro ou envelopada. Em vez de adivinhar um
 * formato só, aceitamos os invólucros comuns e falhamos alto se for outro —
 * a Fase 0 fixa isto para o formato real.
 */
export const unwrap = (payload: unknown, keys: readonly string[]): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  throw new Error(
    `Formato inesperado. Esperava array ou objeto com ${keys.join("/")}, veio: ` +
      `${JSON.stringify(payload).slice(0, 300)}`,
  );
};
