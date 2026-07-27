# Identity Security Lab

Mini lab IAM / IGA pour comprendre et démontrer les mécanismes clés de l'Identity & Access Management : SSO OpenID Connect, RBAC, demande d'accès, validation manager, révocation et audit logs.

Ce n'est pas une plateforme IAM de production. C'est un laboratoire d'apprentissage, pensé pour être lu, compris et expliqué.

## Objectif

Relier des concepts IAM souvent abstraits à une implémentation réelle. Le lab répond de bout en bout aux six questions de base de l'IAM :

- Qui est l'utilisateur ? Authentification OIDC déléguée à Keycloak.
- À quoi a-t-il accès ? Rôles effectifs calculés côté serveur.
- Pourquoi y a-t-il accès ? Demande d'accès justifiée.
- Qui l'a approuvé ? Validation manager, avec séparation des tâches.
- Quand faut-il le retirer ? Révocation immédiatement effective.
- Comment le prouver ? Audit log sur chaque action sensible.

## Statut

- Phase 1, fondation documentaire : terminée
- Phase 2, Keycloak et authentification : en cours
- Phase 3, RBAC : à faire
- Phase 4, workflow de demande d'accès : à faire
- Phase 5, accès et révocation : à faire
- Phase 6, finalisation : à faire

Les sections d'installation décrivent la cible. Elles deviendront exécutables à la fin de la phase 2.

## Architecture

```txt
                          Keycloak :8080
                            ▲          ▲
                    OIDC    │          │  JWKS
                            │          │
Navigateur → Next.js :3000 ─┘          └─ API Express :4000 → PostgreSQL :5432
             client OIDC                   resource server
                    └──── Bearer token ────────┘
```

Le découpage en deux services est volontaire. L'API est un resource server à part entière : elle valide elle-même la signature, l'issuer, l'audience et l'expiration de chaque jeton reçu, sans faire confiance à l'appelant.

Détail dans [docs/architecture.md](docs/architecture.md).

## Stack

- Frontend : Next.js (App Router), TypeScript, Tailwind
- Authentification : Auth.js v5, OpenID Connect
- Backend : Node.js, Express, TypeScript
- Identity Provider : Keycloak
- Base de données : PostgreSQL
- ORM : Prisma
- Infra locale : Docker Compose

## Installation

Prérequis : Docker, Docker Compose, Node.js 20 ou plus.

### 1. Configurer

```bash
git clone <url-du-repo>
cd identity-security-lab
cp .env.example .env
```

### 2. Démarrer l'infrastructure

```bash
docker compose up -d
```

Démarre PostgreSQL et Keycloak. Le realm est importé automatiquement depuis `keycloak/realm-export.json`.

Vérifier que Keycloak répond :

```bash
curl -s http://localhost:8080/realms/identity-lab/.well-known/openid-configuration | jq .issuer
```

### 3. Lancer l'API

```bash
cd backend
npm install
npx prisma migrate dev
npm run dev
```

### 4. Lancer le frontend

```bash
cd frontend
npm install
npm run dev
```

Application disponible sur http://localhost:3000

## Configuration Keycloak

Le realm est versionné et réimporté à chaque démarrage, aucune configuration manuelle n'est nécessaire pour utiliser le lab.

- Realm : `identity-lab`
- Client frontend : `identity-lab-web`, confidentiel, Authorization Code + PKCE
- Audience API : `identity-lab-api`
- Redirect URI : `http://localhost:3000/api/auth/callback/keycloak`
- Rôles de realm : user, manager, admin
- Console admin : http://localhost:8080

La procédure de configuration manuelle est décrite dans [docs/keycloak-setup.md](docs/keycloak-setup.md), rédigée en phase 2.

## Variables d'environnement

Copier `.env.example` vers `.env`. Le fichier `.env` ne doit jamais être commité.

```txt
DATABASE_URL              connexion PostgreSQL de l'application
KEYCLOAK_ISSUER           http://localhost:8080/realms/identity-lab
KEYCLOAK_CLIENT_ID        identity-lab-web
KEYCLOAK_CLIENT_SECRET    secret du client, généré par Keycloak
KEYCLOAK_AUDIENCE         identity-lab-api
AUTH_SECRET               secret de chiffrement des sessions
AUTH_URL                  http://localhost:3000
API_URL                   http://localhost:4000
```

Les valeurs de `.env.example` sont des valeurs de démonstration locales, à ne jamais réutiliser ailleurs.

## Comptes de démonstration

```txt
user@example.com       rôle user
manager@example.com    rôle manager
admin@example.com      rôle admin
```

Mots de passe locaux, définis dans `.env.example`. Usage de démonstration uniquement.

## Fonctionnalités

- Authentification SSO via Keycloak, en Authorization Code + PKCE
- Profil utilisateur et claims décodés
- RBAC appliqué côté serveur, avec validation JWT via JWKS
- Demande d'accès justifiée
- File d'approbation pour les managers
- Approbation ou refus, avec commentaire de revue
- Accès accordé, rattaché à un approbateur et horodaté
- Révocation immédiatement effective
- Séparation des tâches : personne ne peut approuver sa propre demande
- Audit log sur chaque action sensible, réservé aux managers et admins

## Captures d'écran

À ajouter en phase 6.

```txt
docs/screenshots/login.png             page de login Keycloak
docs/screenshots/profile.png           profil et claims décodés
docs/screenshots/access-denied.png     accès refusé sur /admin
docs/screenshots/request-access.png    formulaire de demande
docs/screenshots/manager-requests.png  file d'approbation
docs/screenshots/audit-logs.png        audit logs
```

## Concepts IAM démontrés

- SSO et OIDC : login délégué, le mot de passe ne passe pas par l'application
- Authorization Code + PKCE : flux complet, documenté étape par étape
- Validation de jeton : signature RS256 via JWKS, contrôle de `iss`, `aud` et `exp`
- RBAC : permissions par rôle appliquées dans l'API
- Moindre privilège : aucun compte ne démarre avec le rôle admin
- Workflow IGA : demande, justification, approbation, refus, attribution
- Séparation des tâches : interdiction d'approuver sa propre demande
- Révocation : droits recalculés à chaque requête, effet immédiat
- Auditabilité : qui a fait quoi, sur quoi, quand et avec quel résultat
- Joiner / Mover / Leaver : rôle initial, évolution par demande, retrait par révocation

## Documentation

```txt
docs/iam-vocabulary.md           vocabulaire IAM, IGA, PAM, RBAC, ABAC, SoD
docs/jml-cycle.md                cycle Joiner / Mover / Leaver et risques
docs/architecture.md             architecture, flux et décisions
docs/oauth-oidc-notes.md         OAuth 2.0, OIDC, PKCE, jetons, validation JWKS
docs/rbac-model.md               rôles, permissions, calcul des droits effectifs
docs/access-request-scenario.md  scénario fonctionnel complet
docs/keycloak-setup.md           configuration pas à pas (phase 2)
docs/audit-logs.md               événements d'audit et format (phase 4)
docs/resources.md                standards et ressources
```

## Limites connues

- Les rôles accordés ne sont pas propagés à Keycloak. Ils n'existent que dans cette application.
- Pas de périmètre managérial : tout manager peut approuver la demande de n'importe qui.
- Pas d'accès temporaire, les accès accordés n'expirent pas automatiquement.
- Pas de campagne de revue d'accès ni de recertification.
- Permissions grossières : trois rôles, sans permissions atomiques.
- Keycloak tourne en mode développement, sans TLS ni durcissement.
- Pas de déploiement, le lab tourne en local uniquement.
- Pas de tests automatisés dans le périmètre du MVP.

## Améliorations envisagées

- Propagation des accès vers Keycloak via l'Admin API, ou provisioning SCIM
- Accès temporaires avec expiration automatique
- Campagne de revue d'accès et recertification
- Relation manager / collaborateur pour un vrai périmètre d'approbation
- Intégration Microsoft Entra ID en Identity Provider fédéré
- Support SAML 2.0
- Inventaire des identités non humaines : comptes de service, clés d'API
- Notifications par email sur les demandes et approbations
- Politiques d'autorisation en policy-as-code
- Tests automatisés et contrôles de sécurité en CI/CD

## Licence et usage

Projet personnel d'apprentissage. Aucune donnée d'entreprise réelle n'est utilisée.
