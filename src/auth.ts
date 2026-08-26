import {
  AuthenticationDetails,
  CognitoRefreshToken,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";
import { AUTH_CACHE_PATH, COGNITO, credentials } from "./config";

/**
 * Autenticação via Cognito SRP — o mesmo fluxo que o app faz no navegador,
 * só que headless. O IdToken resultante é o Bearer aceito pelo backend.
 */

type Session = {
  email: string;
  idToken: string;
  refreshToken: string;
  /** epoch em ms */
  expiresAt: number;
};

const pool = new CognitoUserPool({
  UserPoolId: COGNITO.userPoolId,
  ClientId: COGNITO.clientId,
});

const userFor = (email: string) => new CognitoUser({ Username: email, Pool: pool });

const toSession = (email: string, session: CognitoUserSession): Session => ({
  email,
  idToken: session.getIdToken().getJwtToken(),
  refreshToken: session.getRefreshToken().getToken(),
  // getExpiration() vem em segundos
  expiresAt: session.getIdToken().getExpiration() * 1000,
});

const readCache = async (): Promise<Session | null> => {
  const file = Bun.file(AUTH_CACHE_PATH);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as Session;
  } catch {
    return null;
  }
};

const writeCache = async (session: Session) => {
  await Bun.write(AUTH_CACHE_PATH, JSON.stringify(session, null, 2));
};

/** Login SRP completo. Só roda quando não há cache válido nem refresh possível. */
const signIn = async (): Promise<Session> => {
  const { email, password } = credentials();
  const user = userFor(email);
  const details = new AuthenticationDetails({ Username: email, Password: password });

  return new Promise<Session>((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: (session) => resolve(toSession(email, session)),
      onFailure: (err) => reject(new Error(`Login falhou: ${err.message ?? String(err)}`)),
      // Os três abaixo interrompem o fluxo headless de propósito: cada um exige
      // uma decisão humana que não cabe a este cliente tomar sozinho.
      newPasswordRequired: () =>
        reject(new Error("O Cognito exige troca de senha. Faça isso no app e rode de novo.")),
      mfaRequired: () =>
        reject(new Error("MFA por SMS ativo — este cliente não cobre MFA. Me avise para eu adicionar o fallback via browser.")),
      totpRequired: () =>
        reject(new Error("MFA por TOTP ativo — este cliente não cobre MFA. Me avise para eu adicionar o fallback via browser.")),
    });
  });
};

const refresh = async (session: Session): Promise<Session> => {
  const user = userFor(session.email);
  const token = new CognitoRefreshToken({ RefreshToken: session.refreshToken });

  return new Promise<Session>((resolve, reject) => {
    user.refreshSession(token, (err, refreshed: CognitoUserSession) => {
      if (err) reject(new Error(`Refresh falhou: ${err.message ?? String(err)}`));
      else resolve(toSession(session.email, refreshed));
    });
  });
};

/** Margem para não usar um token que expira no meio do request. */
const SKEW_MS = 60_000;

/**
 * Devolve um IdToken válido, na ordem mais barata possível:
 * cache vivo → refresh → login novo.
 */
export const getIdToken = async (forceLogin = false): Promise<string> => {
  if (!forceLogin) {
    const cached = await readCache();
    if (cached) {
      if (cached.expiresAt - SKEW_MS > Date.now()) return cached.idToken;
      try {
        const refreshed = await refresh(cached);
        await writeCache(refreshed);
        return refreshed.idToken;
      } catch {
        // refresh token venceu — cai para login completo
      }
    }
  }
  const session = await signIn();
  await writeCache(session);
  return session.idToken;
};
