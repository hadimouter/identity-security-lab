import { auth } from "@/auth";

/**
 * Appels à l'API Express.
 *
 * Ils partent toujours du serveur Next.js, jamais du navigateur : c'est
 * ce qui permet de joindre l'access token sans jamais l'exposer au
 * JavaScript client. Le navigateur ne détient qu'un cookie de session.
 */

export type ApiMe = {
  identity: { sub: string; username?: string; email?: string };
  localUser: { id: string; createdAt: string };
  /**
   * Décomposition des droits effectifs :
   *   all = fromToken ∪ fromGrants
   * C'est `all` qui décide, et il est recalculé à chaque requête.
   */
  roles: {
    fromToken: string[];
    fromGrants: string[];
    all: string[];
  };
  token: {
    issuer: string;
    audience: string;
    expiresAt?: number;
    checks: string[];
  };
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status?: number; message: string };

async function get<T>(path: string): Promise<ApiResult<T>> {
  const session = await auth();

  if (!session?.accessToken) {
    return { ok: false, message: "Aucun access token dans la session." };
  }

  try {
    const response = await fetch(`${process.env.API_URL}${path}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      return {
        ok: false,
        status: response.status,
        message: body.message ?? response.statusText,
      };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch {
    // L'API peut ne pas être démarrée : le lab reste utilisable sans elle.
    return {
      ok: false,
      message: `API injoignable sur ${process.env.API_URL}. Est-elle démarrée ?`,
    };
  }
}

export function fetchMe(): Promise<ApiResult<ApiMe>> {
  return get<ApiMe>("/api/me");
}
