# Modèle RBAC

Ce document définit qui a le droit de faire quoi, et comment cette décision est calculée.

## Les trois rôles

### user

Rôle de base. Attribué à tout collaborateur authentifié, dès l'arrivée.

### manager

Rôle métier. Valide ou refuse les demandes d'accès, révoque des accès.

### admin

Rôle à privilèges. Administration de l'application et consultation de toutes les données. Traité comme un accès sensible.

Les rôles sont cumulables : un utilisateur peut porter `manager` et `admin` à la fois.

En pratique, `manager` dispose aussi des droits `user`, et `admin` des droits `manager`. Cette portée élargie vient d'une **énumération explicite dans la matrice**, pas d'un mécanisme d'héritage : chaque endpoint liste les rôles qu'il accepte, et `admin` y figure nommément. Aucun contrôle ne repose sur une hiérarchie implicite qu'il faudrait deviner.

## Deux sources de droits

L'information « cet utilisateur a le rôle X » peut venir de deux endroits :

- les rôles de realm Keycloak, dans le claim `realm_access.roles` de l'access token
- la table `access_grants`, alimentée par le workflow de demande d'accès

Sans règle claire, le lab devient incohérent : le manager approuve une demande, le grant est créé, mais l'utilisateur n'a toujours pas accès parce que son jeton ne contient pas le rôle. Ou bien on révoque un grant et l'accès reste ouvert.

### Règle retenue

```txt
rôles effectifs = rôles du token Keycloak + rôles des grants ACTIVE en base
```

Le calcul est refait côté serveur à chaque requête API. Il n'est jamais mis en cache dans la session ni dans le jeton.

### Répartition

Keycloak porte le rôle d'identité, celui du Joiner. Il est géré par l'administrateur IAM et change rarement.

`access_grants` porte les entitlements applicatifs, c'est-à-dire les accès supplémentaires demandés et approuvés. Ils sont gérés par le workflow et révocables à tout moment.

### Raisons de ce choix

- La révocation est immédiatement effective. Les droits étant relus en base à chaque requête, couper un grant coupe l'accès dès l'appel suivant, sans attendre l'expiration du jeton et sans appeler l'Admin API de Keycloak.
- Cela règle la limite classique des JWT. Un jeton signé ne peut pas être révoqué avant son `exp`. Ici le jeton ne porte que l'identité et le rôle de base, les droits sensibles restent en base.
- Cela sépare l'authentification de la gouvernance. Keycloak répond « qui es-tu ». L'application répond « qu'as-tu le droit de faire, qui te l'a accordé et quand ».
- La traçabilité reste côté application. Chaque droit accordé est rattaché à une demande justifiée, un approbateur et une date.

### Limite

Les rôles accordés par grant n'existent que dans cette application. Ils ne sont pas propagés à Keycloak et ne sont donc pas visibles par les autres clients du realm. Dans un vrai IGA, l'approbation déclencherait un provisioning vers l'IdP via l'Admin API ou SCIM. C'est une limite volontaire du MVP.

## Permissions par rôle

### user

Peut :

- se connecter et consulter son profil
- créer une demande d'accès
- consulter ses propres demandes
- consulter ses propres accès actifs

Ne peut pas :

- approuver ou refuser une demande
- révoquer un accès
- consulter les audit logs
- accéder aux pages admin

### manager

Peut, en plus des droits `user` :

- consulter toutes les demandes en attente
- approuver une demande
- refuser une demande avec un commentaire
- consulter tous les accès accordés
- révoquer un accès
- consulter les audit logs

Ne peut pas :

- accéder aux pages admin, sauf s'il porte aussi le rôle `admin`

### admin

Peut, en plus des droits `manager` :

- accéder au tableau de bord admin
- lister tous les utilisateurs

## Séparation des tâches

Un utilisateur ne peut jamais approuver ni refuser sa propre demande d'accès, quel que soit son rôle.

Sans cette règle, un manager pourrait se demander le rôle `admin` et se l'accorder lui-même. Le contrôle est appliqué côté serveur dans le handler d'approbation. Une tentative génère un audit log `unauthorized_access_attempt`.

## Où le contrôle est appliqué

Le frontend masque les liens et les pages non autorisés, et redirige. C'est du confort d'usage, pas de la sécurité.

L'API vérifie le jeton puis le rôle avant toute action. C'est le seul contrôle qui fait autorité.

Toutes les règles ci-dessus sont donc appliquées dans l'API. Le frontend se contourne avec un `curl` ou les DevTools, cacher un bouton ne protège pas un endpoint.

Test de vérification prévu : appeler un endpoint manager avec le jeton d'un user via `curl`, et obtenir un 403 accompagné d'un audit log.

## Correspondance avec les routes

Pages frontend :

```txt
/                     public
/profile              authentifié
/request-access       authentifié
/my-requests          authentifié
/my-access            authentifié
/manager/requests     manager ou admin
/manager/grants       manager ou admin
/manager/audit-logs   manager ou admin
/admin                admin
/admin/users          admin
```

Endpoints API :

```txt
GET  /api/me                              authentifié
POST /api/access-requests                 authentifié
GET  /api/access-requests/mine            authentifié
GET  /api/access-requests?status=pending  manager, admin
POST /api/access-requests/:id/approve     manager, admin
POST /api/access-requests/:id/reject      manager, admin
GET  /api/grants/mine                     authentifié
GET  /api/grants                          manager, admin
POST /api/grants/:id/revoke               manager, admin
GET  /api/audit-logs                      manager, admin
GET  /api/users                           admin
```

## Moindre privilège

- Les comptes de démo démarrent avec un seul rôle.
- Le rôle `admin` n'est jamais attribué par défaut. Il doit être demandé, justifié et approuvé.
- Tout accès supplémentaire est explicite, justifié, tracé et révocable.
- Une demande refusée ne laisse aucun droit résiduel.

## Ce que le modèle ne fait pas

- Pas de permissions fines. Les rôles sont grossiers. Un vrai modèle définirait des permissions atomiques regroupées en rôles.
- Pas de périmètre managérial. Tout manager peut approuver la demande de n'importe qui, il n'y a pas de relation manager / collaborateur.
- Pas d'accès temporaire. Les grants n'expirent pas. Un accès admin reste actif jusqu'à révocation manuelle, alors qu'un vrai PAM imposerait une élévation limitée dans le temps.
- Pas de campagne de revue d'accès ni de recertification périodique.
- Pas d'ABAC. Aucune décision ne dépend d'attributs de contexte comme le département, l'horaire ou l'appareil.
- Pas de propagation vers l'IdP.
