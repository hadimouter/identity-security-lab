/**
 * Styles partagés des éléments cliquables.
 *
 * Centralisés pour que les états hover, active et disabled restent
 * identiques partout : dupliqués, ils finissent par diverger.
 */

export const PRIMARY_BUTTON =
  "rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background " +
  "transition-opacity hover:opacity-90 active:opacity-80";

export const SECONDARY_BUTTON =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium " +
  "transition-colors hover:border-foreground/30 hover:bg-foreground/5 " +
  "active:bg-foreground/10";

/** Lien de navigation, avec une cible tactile suffisante. */
export const NAV_LINK =
  "-mx-1 rounded px-1 py-2 text-sm text-muted transition-colors hover:text-foreground";

/** Lien de contenu, sur fond de carte. */
export const INLINE_LINK =
  "text-accent underline-offset-4 transition-opacity hover:underline hover:opacity-80";
