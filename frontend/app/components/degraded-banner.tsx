/**
 * Avertissement affiché quand les droits montrés proviennent du repli.
 *
 * L'API est injoignable : on retombe sur les rôles du jeton, ce qui est
 * restrictif et donc sûr, mais incomplet. Les accès obtenus par le
 * workflow n'apparaissent plus.
 *
 * Le signaler est le cœur du correctif : auparavant, ces écrans
 * disparaissaient sans un mot et l'utilisateur croyait avoir perdu ses
 * droits.
 */
export function DegradedBanner() {
  return (
    <div
      role="status"
      className="border-b border-amber-500/40 bg-amber-500/10 px-6 py-2.5 text-center text-xs"
    >
      L&apos;API est injoignable. Seuls les rôles portés par votre jeton sont
      pris en compte : les accès obtenus par approbation n&apos;apparaissent pas
      tant qu&apos;elle n&apos;a pas répondu.
    </div>
  );
}
