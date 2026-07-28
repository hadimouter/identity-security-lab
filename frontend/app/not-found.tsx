import { MessageScreen } from "@/app/components/message-screen";

export default function NotFound() {
  return (
    <MessageScreen
      code="404"
      title="Page introuvable"
      description="Cette adresse ne correspond à aucun écran du lab."
      hint="Le tableau de bord de l'accueil liste les écrans que votre rôle vous ouvre."
    />
  );
}
