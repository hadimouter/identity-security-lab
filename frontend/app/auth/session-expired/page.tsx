import { MessageScreen } from "@/app/components/message-screen";
import { SubmitButton } from "@/app/components/submit-button";
import { login } from "@/app/actions";
import { PRIMARY_BUTTON } from "@/lib/ui";

/**
 * Session expirée.
 *
 * Atteinte quand le renouvellement de l'access token a échoué : la
 * session SSO de Keycloak est arrivée au bout de son inactivité
 * maximale, ou l'Identity Provider est indisponible.
 *
 * L'écran existe pour ne plus laisser l'utilisateur dans un état
 * « connecté mais cassé », où l'application semblait fonctionner alors
 * que plus aucun appel à l'API n'aboutissait.
 */
export default function SessionExpiredPage() {
  return (
    <MessageScreen
      code="Session expirée"
      title="Votre session a expiré"
      description="Le renouvellement de votre jeton d'accès a échoué. Reconnectez-vous pour continuer."
      hint="Un access token dure 5 minutes et se renouvelle automatiquement tant que la session SSO est vivante. Celle-ci expire après 30 minutes d'inactivité — ou plus tôt si l'Identity Provider est indisponible."
      action={
        <form action={login}>
          <SubmitButton pendingLabel="Redirection…" className={PRIMARY_BUTTON}>
            Se reconnecter
          </SubmitButton>
        </form>
      }
    />
  );
}
