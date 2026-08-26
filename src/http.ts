import { API_BASE, CONCURRENCY } from "./config";
import { getIdToken } from "./auth";

/**
 * Transporte GET-only.
 *
 * O mesmo padrão de URL que usamos para ler (/api/meetings/{id}/transcription)
 * também expõe escrita em produção na conta real: /title, /tags, /send-bot,
 * /restart-bot, /override-no-show. Este módulo é fisicamente incapaz de chamar
 * qualquer coisa que não seja GET — a trava está no transporte, não numa
 * convenção. Remover isso é uma decisão consciente, não um detalhe.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`HTTP ${status} em ${path}${body ? ` — ${body.slice(0, 200)}` : ""}`);
    this.name = "HttpError";
  }
}

/** Semáforo simples: mantém no máximo N requests em voo. */
const createLimiter = (max: number) => {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resume) => waiting.push(resume));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
};

const limit = createLimiter(CONCURRENCY);

const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Backoff exponencial com jitter, para não sincronizar retries. */
const backoffMs = (attempt: number) => 500 * 2 ** attempt + Math.random() * 250;

const isRetryable = (status: number) => status === 429 || status >= 500;

/**
 * GET cru, devolvendo o corpo como texto. Reautentica uma vez em 401 e
 * repete em 429/5xx com backoff.
 */
export const getText = async (path: string): Promise<string> =>
  limit(async () => {
    let refreshed = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const token = await getIdToken(refreshed);
      const response = await fetch(`${API_BASE}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (response.ok) return response.text();

      const body = await response.text().catch(() => "");

      // 401 uma única vez: token pode ter vencido no meio do voo.
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        continue;
      }

      if (isRetryable(response.status) && attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }

      throw new HttpError(response.status, path, body);
    }

    throw new HttpError(0, path, "esgotou as tentativas");
  });

/** GET com JSON parseado. O shape é validado pelos schemas, não aqui. */
export const getJson = async (path: string): Promise<unknown> => {
  const text = await getText(path);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Resposta de ${path} não é JSON válido: ${text.slice(0, 200)}`);
  }
};
