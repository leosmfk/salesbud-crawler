import { type } from "arktype";
import { getJson } from "./http";
import { templateAnswer, type MeetingSummary, type TemplateAnswer } from "./schemas";

/**
 * Ficha da reunião: os metadados que a tela mostra ao lado da transcrição.
 *
 * Quase tudo já vem na listagem — título, data, tags, rating e convidados. Só o
 * resumo exige uma chamada extra, à aba Template.
 */

const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/**
 * O resumo executivo gerado por IA. Depende do `templateId` da reunião; sem ele
 * não há o que buscar. Um erro aqui não invalida o resto da ficha.
 */
export const fetchTemplateAnswers = async (
  meetingId: number,
  templateId: number | null | undefined,
): Promise<TemplateAnswer[]> => {
  if (!templateId) return [];

  const payload = await getJson(
    `/api/meetings/admin/load/template?meetingId=${meetingId}&templateId=${templateId}`,
  );
  const parsed = templateAnswer.array()(payload);
  if (parsed instanceof type.errors) {
    throw new Error(`Template de ${meetingId} fora do schema: ${parsed.summary}`);
  }
  return parsed;
};

const formatDateTime = (meetingAt: string, timeZone: string) =>
  new Date(meetingAt).toLocaleString("pt-BR", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  });

/** 2926s → "48min46s". */
const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}min${String(rest).padStart(2, "0")}s` : `${minutes}min`;
};

/** `customerName` é uma string com os e-mails separados por vírgula. */
const invitedEmails = (customerName: string | null | undefined) =>
  (customerName ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

export const toMarkdown = (meeting: MeetingSummary, answers: readonly TemplateAnswer[]): string => {
  const timeZone = meeting.metadata?.timezone ?? DEFAULT_TIMEZONE;
  const organizer = [meeting.User?.firstName, meeting.User?.lastName].filter(Boolean).join(" ");
  const emails = invitedEmails(meeting.customerName);
  const tags = (meeting.tags ?? []).map((t) => t.name);
  const rating = meeting.evaluation?.rating;

  const lines = [`# ${meeting.title}`, ""];

  if (meeting.meetingAt) lines.push(`- **Data:** ${formatDateTime(meeting.meetingAt, timeZone)}`);
  if (meeting.duration) lines.push(`- **Duração:** ${formatDuration(meeting.duration)}`);
  if (organizer) lines.push(`- **Organizador:** ${organizer}`);
  // Rating 0 é uma nota válida, então testa por null/undefined e não por falsy.
  if (rating !== null && rating !== undefined) lines.push(`- **Rating:** ${rating}/10`);
  lines.push(`- **Reunião:** ${meeting.id}`);

  lines.push("", "## Classificações", "");
  lines.push(tags.length ? tags.map((t) => `- ${t}`).join("\n") : "_Nenhuma._");

  lines.push("", "## Convidados", "");
  lines.push(emails.length ? emails.map((e) => `- ${e}`).join("\n") : "_Nenhum._");

  lines.push("", "## Resumo", "");
  const written = answers.filter((a) => a.answer?.trim());
  if (written.length === 0) {
    lines.push("_Sem resumo gerado para esta reunião._");
  } else {
    for (const item of written) {
      const question = item.TemplateQuestion?.question?.trim();
      if (question) lines.push(`### ${question}`, "");
      lines.push(item.answer!.trim(), "");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
};
