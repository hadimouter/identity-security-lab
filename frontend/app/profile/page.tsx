import { redirect } from "next/navigation";

import { auth } from "@/auth";

/**
 * Page profil.
 *
 * La redirection ci-dessous est un confort de navigation, pas une mesure
 * de sécurité : elle empêche d'afficher une page vide, rien de plus.
 * Le contrôle qui fait autorité sera appliqué par l'API Express, qui
 * vérifie le jeton et les rôles à chaque requête (phase 3).
 */
export default async function ProfilePage() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  const claims = session.claims ?? {};
  const claim = (name: string) => {
    const value = claims[name];
    return typeof value === "string" ? value : "—";
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Profil</h1>

      <section className="space-y-3">
        <h2 className="font-semibold">Identité</h2>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="opacity-60">Nom</dt>
          <dd>{session.user?.name ?? "—"}</dd>

          <dt className="opacity-60">Email</dt>
          <dd className="font-mono">{session.user?.email ?? "—"}</dd>

          <dt className="opacity-60">Username</dt>
          <dd className="font-mono">{claim("preferred_username")}</dd>

          <dt className="opacity-60">Identifiant Keycloak</dt>
          <dd className="font-mono text-xs">{claim("sub")}</dd>
        </dl>
        <p className="text-xs opacity-60">
          L&apos;identifiant Keycloak est le claim <span className="font-mono">sub</span>.
          C&apos;est lui qui servira de clé de rattachement en base, pas
          l&apos;email, qui peut changer.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Rôles</h2>
        {session.roles.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {session.roles.map((role) => (
              <li
                key={role}
                className="rounded border border-black/20 px-2 py-1 font-mono text-xs dark:border-white/25"
              >
                {role}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm opacity-70">Aucun rôle métier attribué.</p>
        )}
        <p className="text-xs opacity-60">
          Extraits de <span className="font-mono">realm_access.roles</span> de
          l&apos;access token. Les rôles techniques de Keycloak
          (<span className="font-mono">offline_access</span>,{" "}
          <span className="font-mono">uma_authorization</span>) sont filtrés.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Claims de l&apos;access token</h2>
        <pre className="overflow-x-auto rounded border border-black/10 p-4 font-mono text-xs dark:border-white/15">
          {JSON.stringify(claims, null, 2)}
        </pre>
        <p className="text-xs opacity-60">
          Affichés à titre pédagogique. Un JWT est signé, pas chiffré :
          n&apos;importe qui peut lire son contenu, seul Keycloak peut en
          produire un valide.
        </p>
      </section>
    </div>
  );
}
