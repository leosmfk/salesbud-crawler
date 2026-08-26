import { type } from "arktype";
import { getJson } from "./http";
import { transcription, type Utterance } from "./schemas";

/**
 * Busca a transcrição de uma reunião.
 *
 * O JSON é só o transporte — é exatamente o que o navegador recebe quando você
 * abre a aba Transcription. Quem decide o que vai para o disco é o chamador.
 */
export const fetchTranscript = async (meetingId: string | number) => {
  const payload = await getJson(`/api/meetings/${meetingId}/transcription`);

  const parsed = transcription(payload);
  if (parsed instanceof type.errors) {
    throw new Error(`Transcrição ${meetingId} fora do schema: ${parsed.summary}`);
  }
  return parsed;
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
 * Dois detalhes que importam para a saída bater:
 *  - o separador é DUAS quebras de linha, não uma;
 *  - `words[]` tem precedência sobre `text`, e as palavras são unidas por um
 *    espaço — o que pode diferir da pontuação de `text`.
 *
 * Corresponde à opção "Original" do seletor. O "Improve with AI" vive em
 * `enhancedTranscript` e não é coberto aqui.
 */
export const toTxt = (utterances: readonly Utterance[]): string =>
  utterances.reduce((out, u) => {
    const words = u.words ?? [];
    const text = words.length > 0 ? words.map((w) => w.text).join(" ") : (u.text ?? "");
    return text.trim() ? `${out}${u.speaker ?? "Unknown"}: ${text}\n\n` : out;
  }, "");
