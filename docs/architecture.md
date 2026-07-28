# Architecture cible

## Vue simple

```txt
                          Keycloak :8080
                          realm identity-lab
                            ▲          ▲
                    OIDC    │          │  JWKS
                            │          │
Navigateur → Next.js :3000 ─┘          └─ API Express :4000 → PostgreSQL :5432
             client OIDC                   resource server      keycloak
                    └──── Bearer token ────────┘                identitylab
```

## Le flux

1. L'utilisateur ouvre l'application et clique sur « Se connecter ».
2. Le frontend le redirige vers Keycloak, en Authorization Code + PKCE. Le mot de passe ne transite pas par l'application.
3. Keycloak renvoie un code, que le frontend échange contre un ID token et un access token. Les jetons restent côté serveur, dans une session cookie `httpOnly`.
4. Pour chaque action métier, le frontend appelle l'API avec `Authorization: Bearer <access_token>`.
5. L'API valide le jeton avec les clés publiques du JWKS de Keycloak : signature RS256, `iss`, `aud`, `exp`. Elle en extrait `sub` et `realm_access.roles`.
6. L'API calcule les rôles effectifs, applique le contrôle RBAC, exécute l'action et écrit un audit log.

## Composants

### Frontend

Rôle OAuth 2.0 : client.

- login et logout OIDC
- profil utilisateur et claims décodés
- demande d'accès
- pages manager
- page admin protégée

Le frontend fonctionne en BFF : les appels à l'API partent du serveur Next.js, pas du navigateur. L'access token n'est jamais exposé au JavaScript client, ce qui évite son vol par XSS.

Le frontend masque les liens et pages non autorisés. C'est du confort d'usage, la sécurité est côté API.

### Backend

Rôle OAuth 2.0 : resource server. Toute la sécurité vit ici.

- vérification du JWT via JWKS
- calcul des rôles effectifs et contrôle RBAC
- gestion des demandes d'accès
- validation manager
- révocation
- écriture des audit logs
- accès base via Prisma

### Keycloak

Rôle OAuth 2.0 : authorization server.

- realm `identity-lab`
- client `identity-lab-web` pour le frontend, confidentiel
- client `identity-lab-api` pour l'audience de l'API
- rôles de realm : user, manager, admin
- utilisateurs de démo
- configuration versionnée dans `keycloak/realm-export.json`, réimportée au démarrage

### PostgreSQL

Un seul conteneur, deux bases séparées.

`keycloak` appartient à Keycloak : utilisateurs, realms, sessions, clés. L'application n'y touche pas.

`identitylab` appartient à l'API : users, roles, access_requests, access_grants, audit_logs.

L'application ne lit pas la base de l'IdP. Elle conserve seulement un mapping entre le claim `sub` et l'utilisateur local, ce qui permet de rattacher demandes, grants et audit logs à une identité stable.

## Décisions

### API séparée plutôt que monolithe Next.js

Un monolithe aurait été plus rapide à écrire. Le découpage en deux services rend les quatre rôles d'OAuth 2.0 observables : l'API reçoit un Bearer token émis par un tiers et doit le valider elle-même, sans faire confiance à l'appelant.

Dans un monolithe, cette validation serait absorbée par la bibliothèque d'authentification et deviendrait invisible. Ici elle est écrite explicitement et se teste en une commande `curl`.

### Rôles effectifs recalculés à chaque requête

Un JWT signé ne peut pas être révoqué avant son expiration. Le jeton ne porte donc que l'identité et le rôle de base, les droits sensibles vivent en base et sont relus à chaque appel. Une révocation prend effet immédiatement.

Détail dans [rbac-model.md](rbac-model.md).

### Docker Compose limité à l'infrastructure

`docker compose up` démarre PostgreSQL et Keycloak. Le frontend et l'API tournent en `npm run dev` sur l'hôte, pour garder le hot reload et des logs lisibles. La containerisation de l'application est reportée en phase 6.

## Ports

```txt
Frontend Next.js   3000    http://localhost:3000
API Express        4000    http://localhost:4000
Keycloak           8080    http://localhost:8080
PostgreSQL         5432    localhost:5432
```

Issuer OIDC : `http://localhost:8080/realms/identity-lab`

## Frontière de sécurité

Tout ce qui vient du navigateur est considéré comme non fiable.

Aucun rôle, aucun identifiant utilisateur et aucun statut envoyé par le client n'est pris en compte. Ces informations sont systématiquement redérivées du jeton validé côté serveur.

Le navigateur ne détient qu'un cookie de session. Il ne voit ni l'access token, ni les rôles qui font foi.

## Exposition de l'API, et durcissement absent

L'API n'est jointe que par le serveur Next.js, sur la boucle locale. Le navigateur ne l'appelle jamais : il parle au serveur Next.js, qui parle à l'API. Trois protections courantes sont donc absentes, volontairement, et il vaut mieux savoir dire pourquoi.

**Pas de CORS.** Aucune requête ne vient d'une origine navigateur, il n'y a donc pas d'origine à autoriser. Sans en-têtes CORS, un script hébergé ailleurs ne peut de toute façon pas lire les réponses de l'API. L'exposer à un navigateur imposerait une liste blanche d'origines explicite, jamais `*`.

**Pas de `helmet`.** Les en-têtes qu'il pose — `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy` — protègent un document rendu dans un navigateur. L'API ne renvoie que du JSON, consommé par un serveur. C'est le frontend qui aurait besoin d'une CSP, et ce lab n'en définit pas non plus.

**Pas de limitation de débit.** C'est la plus discutable des trois. Chaque requête non authentifiée écrit désormais une ligne d'audit : une campagne de sondes ferait enfler la table sans plafond. Une limitation par adresse sur les routes d'authentification serait le premier ajout d'une mise en production, avant même le TLS.

Ce qui protège réellement l'API aujourd'hui : la validation du jeton à chaque requête, le contrôle de rôle serveur, et le fait qu'aucun jeton ne transite par le navigateur. Le durcissement réseau viendrait s'ajouter à cela, pas le remplacer.

## Objectif IAM

1. authentification déléguée à un IdP via OIDC
2. autorisation RBAC appliquée côté serveur
3. demande d'accès justifiée
4. validation manager, avec séparation des tâches
5. attribution d'un accès tracé et rattaché à un approbateur
6. révocation immédiatement effective
7. traçabilité par les audit logs
