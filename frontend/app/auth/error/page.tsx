import { MessageScreen } from "@/app/components/message-screen";
import { SubmitButton } from "@/app/components/submit-button";
import { login } from "@/app/actions";
import { PRIMARY_BUTTON } from "@/lib/ui";

/**
 * Page d'erreur d'authentification.
 *
 * Remplace la page par défaut d'Auth.js, qui est en anglais, hors charte,
 * et renvoie « Check the server logs » à l'utilisateur final.
 *
 * Les codes viennent d'Auth.js et sont passés en query string.
 */
const ERRORS: Record<
  string,
  { title: string; description: string; hint: string }
> = {
  Configuration: {
    title: "L'application n'est pas correctement configurée",
    description:
      "La connexion à l'Identity Provider a échoué avant même l'authentification.",
    hint: "Causes fréquentes en local : Keycloak n'est pas démarré, KEYCLOAK_ISSUER ne correspond pas au realm, ou KEYCLOAK_CLIENT_SECRET est erroné. Vérifier avec docker compose ps puis l'endpoint de découverte du realm.",
  },
  AccessDenied: {
    title: "Accès refusé par l'Identity Provider",
    description:
      "Keycloak a refusé la connexion, ou vous avez annulé sur sa page de login.",
    hint: "Le compte peut être désactivé, ou une action lui être imposée avant connexion, par exemple un changement de mot de passe.",
  },
  Verification: {
    title: "Lien de vérification invalide",
    description: "Ce lien a expiré ou a déjà été utilisé.",
    hint: "Ce lab n'utilise pas de connexion par email. Ce cas ne devrait pas se produire.",
  },
  Default: {
    title: "L'authentification a échoué",
    description: "La connexion n'a pas pu aboutir.",
    hint: "Relancer la connexion. Si l'erreur persiste, consulter les logs du serveur Next.js et ceux de Keycloak.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const details = ERRORS[error ?? "Default"] ?? ERRORS.Default;

  return (
    <MessageScreen
      code={`Erreur d'authentification${error ? ` — ${error}` : ""}`}
      title={details.title}
      description={details.description}
      hint={details.hint}
      action={
        <form action={login}>
          <SubmitButton pendingLabel="Redirection…" className={PRIMARY_BUTTON}>
            Réessayer
          </SubmitButton>
        </form>
      }
    />
  );
}
