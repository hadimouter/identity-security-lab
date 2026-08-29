/**
 * Erreurs métier de l'API.
 *
 * Elles ne signalent pas une panne : la requête était bien formée, c'est
 * l'état des données qui ne permet pas l'opération. Le gestionnaire
 * d'erreurs global les traduit en réponse HTTP.
 */

/**
 * Conflit : l'état de la ressource interdit l'opération demandée.
 *
 * À lever, jamais à retourner, quand le conflit est détecté à
 * l'intérieur d'une transaction.
 *
 * Prisma valide une transaction interactive dès que son callback résout,
 * et ne l'annule que s'il rejette. Retourner un objet de conflit après
 * une écriture conserverait donc cette écriture : on répondrait 409 sur
 * une base déjà modifiée. Seule une exception provoque le rollback.
 *
 * Traduit en 409 par `errorHandler`.
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
