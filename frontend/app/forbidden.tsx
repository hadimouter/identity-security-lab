import { MessageScreen } from "@/app/components/message-screen";

/**
 * Rendu par forbidden(), avec un vrai statut HTTP 403.
 *
 * 403 signifie : l'utilisateur est authentifié, son identité est connue,
 * mais son rôle ne lui donne pas ce droit. À ne pas confondre avec 401,
 * qui signifie que l'identité n'est pas établie.
 */
export default function Forbidden() {
  return (
    <MessageScreen
      code="403 — Accès refusé"
      title="Votre rôle ne permet pas cet accès"
      description="Vous êtes bien authentifié, mais ce contenu demande un rôle que vous n'avez pas."
      hint="C'est le principe du moindre privilège : un accès n'est pas accordé par défaut, il doit être demandé, justifié et approuvé par un manager. Le workflow de demande arrive en phase 4."
    />
  );
}
