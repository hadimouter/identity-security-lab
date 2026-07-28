# Audit logs

Les événements décrits ici sont écrits par l'API et consultables sur `/manager/audit-logs`.

## Objectif

Pouvoir répondre, après coup, à quatre questions sur toute action sensible :

- qui a fait l'action
- quelle action
- sur quoi
- quand, et avec quel résultat

C'est la brique qui rend le lab auditable. Sans elle, un accès accordé n'a pas d'histoire et rien ne prouve qu'il a été justifié et validé.

## Format d'un audit log

```txt
id           identifiant
actor_id     auteur de l'action, null si action systeme
action       nom de l'evenement
target_type  type d'objet vise (access_request, access_grant, user)
target_id    identifiant de l'objet vise
result       success ou denied
metadata     contexte libre en JSON
created_at   horodatage
```

L'acteur est nullable : certaines actions n'ont pas d'auteur identifié, par exemple une tentative d'accès avec un jeton invalide.

## Événements requis

```txt
access_request_created
access_request_approved
access_request_rejected
access_grant_created
access_grant_revoked
unauthorized_access_attempt
```

## Événements optionnels

```txt
user_logged_in
user_logged_out
admin_page_accessed
role_checked
```

## Principes retenus

- Un log est écrit pour toute action qui modifie des droits, ainsi que pour tout refus d'accès.
- Les refus sont journalisés au même titre que les succès. Un journal qui ne contient que des succès ne sert à rien en cas d'incident.
- Le champ `metadata` conserve le contexte utile : rôle demandé, justification, commentaire de revue.
- Aucun jeton, mot de passe ou secret ne doit se retrouver dans un audit log.
- Les logs ne sont ni modifiables ni supprimables depuis l'application.
- La consultation est réservée aux rôles `manager` et `admin`.

## Implémentation

Le helper d'écriture est dans `backend/src/lib/audit.ts`. Il expose deux fonctions, et le choix entre les deux n'est pas anodin.

`writeAuditLog(tx, entry)` prend un client de transaction. Utilisé pour toute action qui modifie des droits : la trace et la modification sont écrites ensemble, ou pas du tout. Une approbation sans sa trace serait un trou dans la piste d'audit.

`writeAuditLogSafely(entry)` écrit en dehors de toute transaction et absorbe les erreurs. Réservé aux refus : un accès refusé doit le rester même si la base d'audit est indisponible. L'inverse offrirait un moyen de contourner le contrôle en saturant la base.

## Correspondance entre actions et événements

```txt
POST /api/access-requests               access_request_created
POST /api/access-requests/:id/approve   access_request_approved
                                        access_grant_created
POST /api/access-requests/:id/reject    access_request_rejected
POST /api/grants/:id/revoke             access_grant_revoked
refus de requireRole                    unauthorized_access_attempt
refus pour séparation des tâches        unauthorized_access_attempt
échec de vérification du jeton          unauthorized_access_attempt
```

## Tentatives non authentifiées

Un refus prononcé avant toute identification est journalisé avec `actorId` nul : aucune identité n'a été établie, et la déduire d'un jeton non vérifié n'aurait pas de sens.

```json
{
  "action": "unauthorized_access_attempt",
  "result": "denied",
  "actorId": null,
  "targetType": "route",
  "targetId": "GET /api/users",
  "metadata": {
    "method": "GET",
    "path": "/api/users",
    "code": "algorithm_not_allowed",
    "reason": "Algorithme de signature non autorisé. Seul RS256 est accepté.",
    "ip": "::1",
    "userAgent": "curl/8.7.1"
  }
}
```

Le champ `code` est stable et sert à filtrer ; `reason` est le message rendu à l'appelant.

```txt
missing_bearer_header    en-tête Authorization absent ou mal formé
malformed_token          le jeton n'est pas un JWT exploitable
token_expired            signature valide, mais exp dépassé
invalid_signature        le jeton n'a pas été émis par Keycloak
invalid_claim_iss        émis par un autre realm
invalid_claim_aud        destiné à une autre application
unknown_signing_key      aucune clé du JWKS ne correspond au kid
algorithm_not_allowed    algorithme autre que RS256, dont alg=none
missing_subject          jeton valide mais sans claim sub
```

**Ce qui n'est jamais enregistré** : le jeton, ni l'en-tête `Authorization`, même tronqué. Un journal d'audit se consulte largement ; y déposer un identifiant de connexion en ferait une cible. Le chemin est enregistré sans la chaîne de requête, qui pourrait transporter des valeurs à ne pas conserver.

## Exemple produit par le scénario de démonstration

```txt
succès   access_request_created       user      {"role":"manager","justification":"..."}
refus    unauthorized_access_attempt  user      {"heldRoles":["user"],"requiredRoles":["manager","admin"]}
succès   access_request_approved      manager   {"role":"manager","comment":"Prise de fonction validee."}
succès   access_grant_created         manager   {"role":"manager","grantedTo":"cms4mbt0x..."}
refus    unauthorized_access_attempt  manager   {"reason":"separation_of_duties","attemptedAction":"approve"}
succès   access_grant_revoked         manager   {"role":"manager","reason":"Fin de la mission..."}
```

## Reste à faire

- filtres et pagination sur la page de consultation
- export du journal, pour une revue hors application
- limitation de débit : une campagne de requêtes non authentifiées écrit une ligne par tentative, sans plafond
