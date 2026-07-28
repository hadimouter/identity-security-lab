export { auth as proxy } from "@/auth";

/**
 * Auth.js exécuté avant chaque requête de page.
 *
 * Sans cela, le jeton renouvelé ne serait jamais persisté : Next.js
 * interdit d'écrire un cookie depuis un composant serveur, si bien que
 * le cookie conservait indéfiniment le jeton d'origine et qu'un
 * renouvellement était redéclenché à chaque chargement.
 *
 * Ici, en revanche, la réponse peut porter un Set-Cookie. Le
 * renouvellement n'a donc lieu qu'une fois par durée de vie de jeton.
 *
 * Le matcher exclut les fichiers statiques : les faire passer par Auth.js
 * n'apporterait rien et ralentirait le rendu.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
