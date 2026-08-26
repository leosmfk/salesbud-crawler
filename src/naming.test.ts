import { expect, test } from "bun:test";
import { idFromFileName, transcriptFileName } from "./naming";

const meeting = (over: Partial<Parameters<typeof transcriptFileName>[0]> = {}) => ({
  id: 2679290,
  title: "Rennova <> Strattum",
  status: 3,
  meetingAt: "2026-08-20T19:00:00.000Z",
  ...over,
});

test("usa a data em horário de Brasília, não em UTC", () => {
  // 19:00Z = 16:00 BRT no mesmo dia, como o app exibe.
  expect(transcriptFileName(meeting(), "txt")).toBe("2026-08-20_Rennova_<>_Strattum_2679290.txt");
});

test("não deixa espaço nenhum no nome", () => {
  const nomes = [
    transcriptFileName(meeting(), "txt"),
    transcriptFileName(meeting({ title: "[Salesbud + Strattum] Follow-Up!" }), "txt"),
    transcriptFileName(meeting({ title: "  espaços   duplicados  " }), "txt"),
  ];
  for (const nome of nomes) expect(nome).not.toInclude(" ");
});

test("colapsa underscores em vez de empilhar", () => {
  expect(transcriptFileName(meeting({ title: "a   b" }), "txt")).toBe("2026-08-20_a_b_2679290.txt");
});

test("uma reunião logo após meia-noite UTC ainda cai no dia anterior em BRT", () => {
  const name = transcriptFileName(meeting({ meetingAt: "2026-08-21T01:00:00.000Z" }), "txt");
  expect(name).toStartWith("2026-08-20_");
});

test("barra no título não vira subpasta", () => {
  const name = transcriptFileName(meeting({ title: "RJ / Marco" }), "txt");
  expect(name).toBe("2026-08-20_RJ_-_Marco_2679290.txt");
  expect(name).not.toInclude("/");
});

test("títulos iguais no mesmo dia geram nomes distintos", () => {
  const a = transcriptFileName(meeting({ id: 2644483, title: "Dry run Vivo" }), "txt");
  const b = transcriptFileName(meeting({ id: 2644485, title: "Dry run Vivo" }), "txt");
  expect(a).not.toBe(b);
});

test("reconhece o id tanto do nome novo quanto do antigo", () => {
  expect(idFromFileName("2026-08-20_Rennova_<>_Strattum_2679290.txt")).toBe(2679290);
  expect(idFromFileName("2026-08-20 - Rennova <> Strattum - 2679290.txt")).toBe(2679290);
  expect(idFromFileName("2679290.txt")).toBe(2679290);
  expect(idFromFileName("leia-me.md")).toBeNull();
});

test("txt e json compartilham o nome, mudando só a extensão", () => {
  const txt = transcriptFileName(meeting(), "txt");
  const json = transcriptFileName(meeting(), "json");
  expect(json).toBe(txt.replace(/\.txt$/, ".json"));
});
