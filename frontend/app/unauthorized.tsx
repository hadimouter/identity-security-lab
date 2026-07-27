import { MessageScreen } from "@/app/components/message-screen";
import { SubmitButton } from "@/app/components/submit-button";
import { login } from "@/app/actions";

/**
 * Rendu par unauthorized(), avec un vrai statut HTTP 401.
 *
 * 401 signifie : aucune identité établie. La réponse attendue est de
 * s'authentifier. C'est différent de 403, où l'identité est connue mais
 * insuffisante.
 */
export default function Unauthorized() {
  return (
    <MessageScreen
      code="401 — Non authentifié"
      title="Cette page demande une authentification"
      description="Connectez-vous via Keycloak pour continuer."
      hint="401 et 403 ne disent pas la même chose. 401 : je ne sais pas qui vous êtes. 403 : je sais qui vous êtes, et ce n'est pas suffisant."
      action={
        <form action={login}>
          <SubmitButton
            pendingLabel="Redirection…"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Se connecter
          </SubmitButton>
        </form>
      }
    />
  );
}
