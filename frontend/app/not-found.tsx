import { MessageScreen } from "@/app/components/message-screen";

export default function NotFound() {
  return (
    <MessageScreen
      code="404"
      title="Page introuvable"
      description="Cette adresse ne correspond à aucun écran du lab."
      hint="Plusieurs écrans décrits dans le PRD ne sont pas encore implémentés. Le tableau de bord de l'accueil indique lesquels sont disponibles et à quelle phase arrivent les autres."
    />
  );
}
