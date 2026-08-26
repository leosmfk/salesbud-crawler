import { expect, test } from "bun:test";
import { toTxt } from "./transcript";
import type { Utterance } from "./schemas";

/**
 * O contrato é byte-a-byte com o download do app, então os casos espelham os
 * ramos exatos do original em TranscriptTab-*.js. Fixtures seguem o shape real
 * da API (samples/), mas são sintéticos — transcrição de verdade é PII.
 */

const word = (text: string) => ({ text, start: 0, end: 1 });

test("prefere words[] sobre text e separa falas com duas quebras", () => {
  const utterances: Utterance[] = [
    { speaker: "Thierry Cadier", text: "ignorado", words: [word("A"), word("gente")] },
    { speaker: "Luiz Rossetto", text: "Era isso.", words: [] },
  ];

  expect(toTxt(utterances)).toBe("Thierry Cadier: A gente\n\nLuiz Rossetto: Era isso.\n\n");
});

test("descarta falas vazias ou só com espaço", () => {
  const utterances: Utterance[] = [
    { speaker: "A", text: "   ", words: [] },
    { speaker: "B", text: null, words: [] },
    { speaker: "C", text: "ok", words: [] },
  ];

  expect(toTxt(utterances)).toBe("C: ok\n\n");
});

test("speaker ausente vira Unknown em vez de quebrar", () => {
  expect(toTxt([{ text: "oi", words: [] }])).toBe("Unknown: oi\n\n");
});
