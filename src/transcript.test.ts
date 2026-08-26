import { expect, test } from "bun:test";
import { toTxt } from "./transcript";

/**
 * O contrato aqui é byte-a-byte com o download do app, então os casos abaixo
 * espelham exatamente os ramos do código original em TranscriptTab-*.js.
 */

test("prefere words[] sobre text e separa segmentos com duas quebras", () => {
  const txt = toTxt([
    { speaker: "Thierry Cadier", words: [{ text: "A" }, { text: "gente" }], text: "ignorado" },
    { speaker: "Luiz Rossetto", text: "Era isso." },
  ]);

  expect(txt).toBe("Thierry Cadier: A gente\n\nLuiz Rossetto: Era isso.\n\n");
});

test("descarta segmentos vazios ou só com espaço", () => {
  const txt = toTxt([
    { speaker: "A", text: "   " },
    { speaker: "B", words: [] },
    { speaker: "C", text: "ok" },
  ]);

  expect(txt).toBe("C: ok\n\n");
});

test("speaker ausente vira Unknown em vez de quebrar", () => {
  expect(toTxt([{ text: "oi" }])).toBe("Unknown: oi\n\n");
});
