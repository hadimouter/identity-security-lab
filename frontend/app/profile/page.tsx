import { requireFreshSession } from "@/lib/session";
import { TokenCountdown } from "@/app/components/token-countdown";
import { fetchMe } from "@/lib/api";

/**
 * Habillage des rôles.
 *
 * `admin` est traité comme un accès à privilèges, il est donc distingué
 * visuellement. Le code couleur porte une information, il n'est pas décoratif.
 */
const ROLE_STYLES: Record<string, string> = {
  admin:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  manager: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  user: "border-border bg-foreground/5 text-muted",
};

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3.5">
      <dt className="w-40 shrink-0 text-sm text-muted">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

/**
 * Page profil.
 *
 * unauthorized() rend une page 401 avec le bon statut HTTP, plutôt qu'une
 * redirection silencieuse. C'est du confort de navigation, pas une mesure
 * de sécurité : le contrôle qui fait autorité sera appliqué par l'API
 * Express, qui vérifie le jeton et les rôles à chaque requête (phase 3).
 */
export default async function ProfilePage() {
  const session = await requireFreshSession();

  const claims = session.claims ?? {};
  const claim = (name: string) => {
    const value = claims[name];
    return typeof value === "string" ? value : "—";
  };

  // Même identité, mais telle qu'un service tiers la reconstitue après
  // avoir vérifié le jeton lui-même.
  const api = await fetchMe();

  return (
    <div className="space-y-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Profil</h1>
        <p className="text-muted">
          Identité telle que l&apos;application la reçoit de Keycloak.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Identité</h2>
        <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          <Field label="Nom" value={session.user?.name ?? "—"} />
          <Field label="Email" value={session.user?.email ?? "—"} mono />
          <Field label="Username" value={claim("preferred_username")} mono />
          <Field label="Identifiant Keycloak" value={claim("sub")} mono />
        </dl>
        <p className="text-xs text-muted">
          L&apos;identifiant Keycloak est le claim{" "}
          <span className="font-mono">sub</span>. C&apos;est lui qui servira de
          clé de rattachement en base, pas l&apos;email, qui peut changer.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Rôles</h2>
        <div className="rounded-lg border border-border bg-surface p-5">
          {session.roles.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {session.roles.map((role) => (
                <li
                  key={role}
                  className={`rounded-md border px-2.5 py-1 font-mono text-xs ${
                    ROLE_STYLES[role] ?? ROLE_STYLES.user
                  }`}
                >
                  {role}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucun rôle métier attribué.</p>
          )}
        </div>
        <p className="text-xs text-muted">
          Extraits de l&apos;access token, claim{" "}
          <span className="font-mono">realm_access.roles</span>. Les rôles
          techniques de Keycloak sont filtrés. Le rôle{" "}
          <span className="font-mono">admin</span> est distingué comme accès à
          privilèges.
        </p>
      </section>

      {session.expiresAt && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Durée de vie du jeton
          </h2>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-5 py-4 text-sm">
            <span className="text-muted">Expire dans</span>
            <TokenCountdown expiresAt={session.expiresAt} />
          </div>
          <p className="text-xs text-muted">
            Un access token est volontairement de courte durée, 5 minutes ici.
            Passé ce délai il n&apos;est plus accepté, alors que la session de
            l&apos;application reste ouverte. C&apos;est la raison pour laquelle
            les droits ne peuvent pas être décidés à partir du seul jeton.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Vu par l&apos;API Express
        </h2>
        {api.ok ? (
          <>
            <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              <Field
                label="Identifiant Keycloak"
                value={api.data.identity.sub}
                mono
              />
              <Field
                label="Utilisateur local"
                value={api.data.localUser.id}
                mono
              />
              <Field
                label="Rôles du jeton"
                value={api.data.roles.fromToken.join(", ") || "aucun"}
                mono
              />
              <Field
                label="Rôles des accès accordés"
                value={api.data.roles.fromGrants.join(", ") || "aucun"}
                mono
              />
              <Field
                label="Droits effectifs"
                value={api.data.roles.all.join(", ") || "aucun"}
                mono
              />
              <Field
                label="Issuer vérifié"
                value={api.data.token.issuer}
                mono
              />
              <Field
                label="Audience vérifiée"
                value={api.data.token.audience}
                mono
              />
            </dl>
            <ul className="flex flex-wrap gap-2">
              {api.data.token.checks.map((check) => (
                <li
                  key={check}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted"
                >
                  {check}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
            <p className="font-medium">
              L&apos;API n&apos;a pas répondu
              {api.status ? ` (HTTP ${api.status})` : ""}
            </p>
            <p className="mt-1 text-muted">{api.message}</p>
          </div>
        )}
        <p className="text-xs text-muted">
          Ces informations ne viennent pas de cette page. Le serveur Next.js a
          appelé l&apos;API en joignant l&apos;access token, et l&apos;API a
          revérifié elle-même la signature, l&apos;issuer, l&apos;audience et
          l&apos;expiration avant de répondre. Elle ne fait confiance à aucun
          élément transmis par l&apos;appelant.
        </p>
        <p className="text-xs text-muted">
          Les droits effectifs sont l&apos;union des rôles du jeton et des accès
          accordés encore actifs, recalculée à chaque requête. C&apos;est ce qui
          rend une révocation immédiate : le jeton ne change pas, les droits si.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Claims de l&apos;access token
        </h2>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-5 py-2.5 font-mono text-xs text-muted">
            payload du JWT
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-xs leading-relaxed">
            {JSON.stringify(claims, null, 2)}
          </pre>
        </div>
        <p className="text-xs text-muted">
          Affichés à titre pédagogique. Un JWT est signé, pas chiffré :
          n&apos;importe qui peut lire son contenu, seul Keycloak peut en
          produire un valide.
        </p>
      </section>
    </div>
  );
}
