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

export type ApiRole = { name: string; description: string | null };

export type ApiAccessRequest = {
  id: string;
  justification: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  createdAt: string;
  reviewedAt: string | null;
  reviewComment: string | null;
  role: { name: string; description: string | null };
  requester: { email: string; name: string | null };
  reviewedBy: { email: string; name: string | null } | null;
};

export type ApiGrant = {
  id: string;
  status: "ACTIVE" | "REVOKED";
  approvedAt: string;
  revokedAt: string | null;
  role: { name: string };
  user: { email: string; name: string | null };
  approvedBy: { email: string; name: string | null };
  revokedBy: { email: string; name: string | null } | null;
  request: { justification: string } | null;
};

export type ApiAuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  result: string;
  metadata: unknown;
  createdAt: string;
  actor: { email: string; name: string | null } | null;
};

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status?: number; message: string };

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  // auth() déclenche le callback jwt, donc le renouvellement si le jeton
  // a expiré. C'est le seul chemin qui rend la valeur à jour : le cookie,
  // lui, conserve le jeton d'origine.
  const session = await auth();

  if (!session?.accessToken) {
    return { ok: false, message: "Aucun access token disponible." };
  }
  const accessToken = session.accessToken;

  try {
    const response = await fetch(`${process.env.API_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      return {
        ok: false,
        status: response.status,
        message: payload.message ?? response.statusText,
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

export const fetchMe = () => call<ApiMe>("/api/me");

export const fetchRoles = () => call<{ roles: ApiRole[] }>("/api/roles");

export const fetchMyRequests = () =>
  call<{ requests: ApiAccessRequest[] }>("/api/access-requests/mine");

export const fetchPendingRequests = () =>
  call<{ requests: ApiAccessRequest[] }>("/api/access-requests?status=PENDING");

export const fetchMyGrants = () =>
  call<{ grants: ApiGrant[] }>("/api/grants/mine");

export const fetchAllGrants = () => call<{ grants: ApiGrant[] }>("/api/grants");

export const revokeGrant = (id: string, reason: string) =>
  call<unknown>(`/api/grants/${id}/revoke`, {
    method: "POST",
    body: { reason },
  });

export const fetchAuditLogs = () =>
  call<{ logs: ApiAuditLog[] }>("/api/audit-logs");

export const createAccessRequest = (roleName: string, justification: string) =>
  call<ApiAccessRequest>("/api/access-requests", {
    method: "POST",
    body: { roleName, justification },
  });

export const reviewAccessRequest = (
  id: string,
  decision: "approve" | "reject",
  comment: string,
) =>
  call<unknown>(`/api/access-requests/${id}/${decision}`, {
    method: "POST",
    body: { comment },
  });
