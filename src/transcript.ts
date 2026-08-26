import { type } from "arktype";
import { getJson } from "./http";
import { transcriptSegments, unwrap, type TranscriptSegment } from "./schemas";

/** Envelopes plausíveis para a lista de segmentos. Fixado na Fase 0. */
const SEGMENT_KEYS = ["segments", "transcription", "transcript", "data", "items"] as const;

export const fetchTranscript = async (meetingId: string | number) => {
  const payload = await getJson(`/api/meetings/${meetingId}/transcription`);
  const list = unwrap(payload, SEGMENT_KEYS);

  const parsed = transcriptSegments(list);
  if (parsed instanceof type.errors) {
    throw new Error(`Segmentos fora do schema em ${meetingId}: ${parsed.summary}`);
  }
  return { raw: payload, segments: parsed };
};

/**
 * Reproduz byte-a-byte o .txt que o botão de download do app gera.
 *
 * Fonte (assets/TranscriptTab-*.js), desminificado:
 *   segments.forEach(seg => {
 *     const speaker = resolveSpeaker(seg.speaker);
 *     const words   = seg.words || [];
 *     const text    = words.length ? words.map(w => w.text).join(" ") : seg.text || "";
 *     if (text.trim()) out += `${speaker}: ${text}\n\n`;
 *   });
 *
 * Atenção ao separador: são DUAS quebras de linha, não uma.
 */
export const toTxt = (
  segments: readonly TranscriptSegment[],
  resolveSpeaker: (speaker: TranscriptSegment["speaker"]) => string = defaultSpeaker,
): string =>
  segments.reduce((out, segment) => {
    const words = segment.words ?? [];
    const text = words.length > 0 ? words.map((w) => w.text).join(" ") : (segment.text ?? "");
    return text.trim() ? `${out}${resolveSpeaker(segment.speaker)}: ${text}\n\n` : out;
  }, "");

/**
 * No app, `speaker` passa por um resolvedor que troca o id pelo nome do
 * participante. Sem esse mapa, caímos no valor cru — a Fase 0 mostra se o
 * endpoint já devolve o nome pronto.
 */
const defaultSpeaker = (speaker: TranscriptSegment["speaker"]): string =>
  speaker === null || speaker === undefined ? "Unknown" : String(speaker);
