/**
 * Configuração do cliente.
 *
 * Os valores do Cognito não são segredo: vêm do bundle público do próprio app
 * (app.salesbud.com.br/assets/index-*.js) e são idênticos para qualquer usuário.
 * O que é segredo — e-mail e senha — fica no .env, nunca aqui.
 */
export const COGNITO = {
  region: "us-east-1",
  userPoolId: "us-east-1_xZKJMtRws",
  clientId: "21llrjqbt31l0bsbaf0kdtk7rg",
} as const;

/** Backend que serve /api/meetings e /api/meetings/{id}/transcription. */
export const API_BASE = "https://backend-prod.salesbud.com.br";

/** Concorrência deliberadamente baixa: não há rate limit documentado. */
export const CONCURRENCY = 2;

export const AUTH_CACHE_PATH = ".auth.json";
export const SAMPLES_DIR = "samples";

export const outDir = () => process.env.SALESBUD_OUT_DIR ?? "out";

/** Time padrão do export. Sem ele, o backend responde só "My Meetings". */
export const defaultTeamId = () => process.env.SALESBUD_TEAM_ID;

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Faltando ${name} no .env — copie o .env.example.`);
  return value;
};

/** Lazy: só cobra credenciais de comandos que realmente vão à rede. */
export const credentials = () => ({
  email: required("SALESBUD_EMAIL"),
  password: required("SALESBUD_PASSWORD"),
});
