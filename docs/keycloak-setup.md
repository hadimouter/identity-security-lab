# Setup Keycloak

## Objectif

Démarrer l'infrastructure du lab, puis configurer le realm, les rôles et les utilisateurs de démonstration.

Le realm est versionné dans `keycloak/realm-export.json` et réimporté à chaque démarrage : il n'y a rien à configurer à la main pour utiliser le lab. La procédure manuelle est conservée ici parce qu'elle explique ce que contient l'export, et parce qu'un export ne se relit pas facilement.

## Prérequis

- Docker et Docker Compose
- `curl` et `jq` pour les vérifications
- Les ports 5432 et 8080 libres sur la machine

## 1. Démarrer l'infrastructure

```bash
cp .env.example .env
docker compose up -d
```

Deux conteneurs démarrent :

- `identity-lab-postgres` : PostgreSQL 17, deux bases
- `identity-lab-keycloak` : Keycloak 26.7 en mode développement

Keycloak attend que Postgres soit prêt avant de démarrer, via un `healthcheck` et un `depends_on`. Le premier démarrage prend 30 à 60 secondes, le temps que Keycloak crée son schéma.

## 2. Vérifier l'état des services

### État des conteneurs

```bash
docker compose ps
```

Les deux services doivent être `running`, et Postgres `healthy`.

### Postgres et les deux bases

```bash
docker compose exec postgres psql -U lab -d postgres -c "\l"
```

Les bases `keycloak` et `identitylab` doivent apparaître dans la liste.

Vérification ciblée :

```bash
docker compose exec postgres \
  psql -U lab -d postgres -tAc \
  "SELECT datname FROM pg_database WHERE datname IN ('keycloak','identitylab');"
```

Doit renvoyer les deux noms.

### Keycloak

Le plus parlant est d'interroger l'endpoint de découverte OIDC. Il prouve à la fois que le serveur répond et que la couche OIDC fonctionne :

```bash
curl -s http://localhost:8080/realms/master/.well-known/openid-configuration | jq .issuer
```

Doit renvoyer `"http://localhost:8080/realms/master"`.

La même commande fonctionne sur le realm du lab, une fois l'import terminé :

```bash
curl -s http://localhost:8080/realms/identity-lab/.well-known/openid-configuration | jq .issuer
```

Doit renvoyer `"http://localhost:8080/realms/identity-lab"`. Si seul `master` répond, l'import du realm a échoué : les logs sont dans `docker compose logs keycloak`.

### Console d'administration

http://localhost:8080

Identifiants définis par `KEYCLOAK_ADMIN` et `KEYCLOAK_ADMIN_PASSWORD` dans `.env`.

Ce compte administre le serveur Keycloak lui-même. Ce n'est pas un utilisateur du lab.

## 3. Configuration du realm

Cette configuration est déjà contenue dans `keycloak/realm-export.json` et rejouée automatiquement au démarrage. Il n'y a rien à faire pour utiliser le lab.

Cette section documente comment elle a été construite, pour pouvoir la refaire, la modifier ou l'expliquer.

### 3.1 Créer le realm

Sélecteur de realm en haut à gauche → **Create realm** → name `identity-lab` → **Create**.

Un realm est un espace d'identité cloisonné : ses propres utilisateurs, rôles, clients et clés de signature. Le realm `master` sert uniquement à administrer le serveur, on n'y met jamais les utilisateurs d'une application.

Vérifie systématiquement que le sélecteur affiche `identity-lab` avant chaque opération suivante. Des rôles ou des clients créés par erreur dans `master` n'apparaîtront jamais dans les tokens du lab.

### 3.2 Créer les rôles de realm

**Realm roles** → **Create role**, trois fois :

```txt
user      Rôle de base attribué à tout collaborateur authentifié
manager   Valide ou refuse les demandes d'accès, révoque les accès
admin     Rôle à privilèges, administration de l'application
```

Les rôles de realm arrivent dans le token sous `realm_access.roles`. Les rôles de client, eux, arrivent sous `resource_access.<client>.roles` et ne sont pas utilisés ici.

Ne pas ajouter ces rôles au composite `default-roles-identity-lab`. Ils sont attribués explicitement à chaque utilisateur en 3.7, ce qui garantit qu'aucun compte ne reçoit `admin` par défaut.

### 3.3 Créer le client `identity-lab-web`

**Clients** → **Create client**.

```txt
Client type              OpenID Connect
Client ID                identity-lab-web
Name                     Frontend Next.js

Client authentication    ON      rend le client confidentiel
Authorization            OFF
Standard flow            ON      Authorization Code
Direct access grants     ON      voir la note ci-dessous
Implicit flow            OFF     déprécié
Service accounts roles   OFF

Root URL                          http://localhost:3000
Home URL                          /
Valid redirect URIs               http://localhost:3000/api/auth/callback/keycloak
Valid post logout redirect URIs   http://localhost:3000
Web origins                       http://localhost:3000
```

Le frontend échange le code contre des jetons côté serveur, il peut donc garder un secret : on le déclare confidentiel.

Saisir les redirect URIs à l'identique, jamais `http://localhost:3000/*` ni `*`. Le redirect URI est ce qui empêche un attaquant de faire rediriger le code d'autorisation vers un domaine qu'il contrôle.

Direct access grants est déprécié dans OAuth 2.1. Il est laissé actif ici pour pouvoir obtenir un token au `curl` et tester le RBAC de l'API sans navigateur. C'est une facilité de lab, à désactiver en production.

### 3.4 Récupérer le client secret

Onglet **Credentials**, apparu au passage en client confidentiel. Reporter la valeur dans `KEYCLOAK_CLIENT_SECRET` du `.env`.

Dans ce dépôt, ce secret a été remplacé par une valeur de démonstration explicite pour rester versionnable. Voir 3.9.

### 3.5 Créer le client `identity-lab-api`

**Clients** → **Create client**.

```txt
Client type              OpenID Connect
Client ID                identity-lab-api
Name                     API Express (resource server)

Client authentication    ON
tous les flux            OFF
Login settings           vides
```

Ce client ne fait jamais de login. Il existe uniquement pour servir d'identifiant d'audience dans les tokens. C'est ce qu'on appelait un client *bearer-only* dans les anciennes versions.

La console masque les champs **Valid redirect URIs** et **Web origins** quand aucun flux navigateur n'est actif. Si l'assistant les a pré-remplis avec `/*`, la valeur reste stockée sans être visible. Vérifier dans l'export plutôt que dans l'écran.

### 3.6 Ajouter l'audience mapper

**Clients** → `identity-lab-web` → onglet **Client scopes** → **identity-lab-web-dedicated** → onglet **Mappers** → **Configure a new mapper** → **Audience**.

```txt
Name                        audience-identity-lab-api
Included Client Audience    identity-lab-api
Included Custom Audience    (vide)
Add to access token         ON
Add to token introspection  ON
```

Sans ce mapper, les access tokens portent `aud: account`, et la vérification d'audience côté API ne servirait à rien : elle laisserait passer un token émis pour n'importe quelle autre application du realm.

**Included Client Audience** est un menu déroulant qui référence un client existant. **Included Custom Audience** est un champ libre, il ne convient pas ici.

### 3.7 Créer les utilisateurs de démonstration

**Users** → **Add user**, trois fois. Activer **Email verified** : il n'y a pas de serveur SMTP dans ce lab.

```txt
user      user@example.com      Demo User      rôle user
manager   manager@example.com   Demo Manager   rôle manager
admin     admin@example.com     Demo Admin     rôle admin
```

Pour chacun, onglet **Credentials** → **Set password**, avec la valeur `DEMO_*_PASSWORD` du `.env`.

Mettre **Temporary sur OFF**. Laissé sur ON, Keycloak impose un changement de mot de passe au premier login, ce qui casse le flux de démonstration.

Puis onglet **Role mapping** → **Assign role**. Basculer le filtre sur **Realm roles**, sinon seuls les rôles techniques de client sont proposés. Cocher le rôle, puis **Assign**.

Un seul rôle métier par compte. Tout accès supplémentaire doit passer par une demande approuvée.

### 3.8 Vérifier la configuration

Obtenir un token et lire ses claims, sans navigateur.

Un JWT est encodé en base64**url** : une variante qui remplace `+` et `/` par `-` et `_`, et qui omet les `=` de rembourrage. Le `base64` de macOS ne connaît pas cette variante et renvoie une sortie tronquée. Cette fonction rétablit les deux, elle marche sur macOS comme sur Linux :

```bash
jwt() {
  cut -d. -f"${2:-2}" <<< "$1" \
    | jq -R 'gsub("-";"+") | gsub("_";"/") | . + ("=" * ((4 - (length % 4)) % 4)) | @base64d | fromjson'
}
```

```bash
source .env
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/identity-lab/protocol/openid-connect/token" \
  -d "client_id=identity-lab-web" -d "client_secret=$KEYCLOAK_CLIENT_SECRET" \
  -d "username=manager" -d "password=$DEMO_MANAGER_PASSWORD" \
  -d "grant_type=password" -d "scope=openid profile email" \
  | jq -r .access_token)

jwt "$TOKEN"        # la charge utile
jwt "$TOKEN" 1      # l'en-tete : alg, typ, kid
```

Décoder n'est pas vérifier : n'importe qui peut lire un JWT, c'est du base64, pas du chiffrement. Seule la signature prouve l'origine. Le détail est dans [iam-network-troubleshooting.md](iam-network-troubleshooting.md).

Attendu dans la charge utile :

```txt
iss                  http://localhost:8080/realms/identity-lab
aud                  ["identity-lab-api", "account"]
azp                  identity-lab-web
realm_access.roles   contient "manager"
exp - iat            300 secondes
```

Vérifier aussi qu'un redirect URI non déclaré est refusé :

```bash
curl -s -o /dev/null -w "%{http_code}\n" -G \
  "http://localhost:8080/realms/identity-lab/protocol/openid-connect/auth" \
  --data-urlencode "client_id=identity-lab-web" \
  --data-urlencode "redirect_uri=http://attaquant.example.com/vol" \
  --data-urlencode "response_type=code" --data-urlencode "scope=openid"
```

Doit renvoyer `400`. Avec le redirect URI déclaré, la même requête renvoie `200` et sert la page de login.

### 3.9 Exporter le realm

```bash
./scripts/export-realm.sh
```

Le script exporte le realm avec ses utilisateurs, puis écrit `keycloak/realm-export.json`. À relancer après toute modification dans la console.

Deux points sur le contenu de l'export :

Les mots de passe des utilisateurs sont exportés sous forme de **hachages**, jamais en clair.

L'export embarque les **secrets des clients**, y compris ceux des clients internes de Keycloak (`broker`, `realm-management`), régénérés à chaque création de realm. Le script les remplace par des valeurs de démonstration explicites, pour qu'aucun credential généré ne soit versionné. Les secrets de `identity-lab-web` et `identity-lab-api` ont été fixés à des valeurs lisibles pour la même raison, et par cohérence avec les mots de passe de démonstration du `.env.example`.

Ce fichier rend le lab reproductible : `docker compose down -v && docker compose up -d` reconstruit le realm complet, rôles, clients, mappers et utilisateurs compris.

## Commandes utiles

Suivre les logs :

```bash
docker compose logs -f keycloak
docker compose logs -f postgres
```

Arrêter les services en conservant les données :

```bash
docker compose down
```

Tout remettre à zéro, y compris les bases :

```bash
docker compose down -v
```

`down -v` supprime le volume `postgres-data`. Au démarrage suivant, `scripts/init-db.sql` est rejoué et les deux bases sont recréées vides. Keycloak reconstruit alors son schéma et réimporte le realm depuis `keycloak/`.

## Dépannage

**Le port 5432 est déjà utilisé.** Un Postgres tourne probablement déjà sur la machine. Changer `POSTGRES_PORT` dans `.env`, par exemple `5433`. Le port interne au réseau Docker reste 5432, seule la publication sur l'hôte change.

**Le port 8080 est déjà utilisé.** Même principe avec `KEYCLOAK_PORT`. Attention, changer ce port oblige à mettre `KEYCLOAK_ISSUER` à jour, ainsi que les redirect URIs du client Keycloak.

**Keycloak redémarre en boucle.** Presque toujours un problème de connexion à la base. Vérifier les logs, et que la base `keycloak` existe bien.

**Les bases n'ont pas été créées.** `scripts/init-db.sql` n'est joué qu'au premier démarrage, quand le volume est vide. Si le volume existait déjà, faire `docker compose down -v` puis `docker compose up -d`.

**Les modifications de `.env` ne sont pas prises en compte.** Docker Compose lit `.env` au lancement. Faire `docker compose up -d --force-recreate` après modification.

**Keycloak répond `{"error":"invalid_request","error_description":"HTTPS required"}` en HTTP.** C'est le paramètre `sslRequired` du realm. Sa valeur par défaut, `external`, autorise le HTTP pour les adresses privées et le refuse pour les autres, en se fondant sur l'adresse source vue par le serveur. Derrière la couche réseau de Docker Desktop, cette détection n'est pas fiable et peut basculer après une recréation du réseau.

Le realm `identity-lab` est donc fixé à `sslRequired: none` dans l'export, ce qui rend le comportement déterministe en local. Le realm `master` conserve la valeur par défaut. S'il refuse le HTTP après une remise à zéro, la console d'administration devient inaccessible ; corriger avec :

```bash
source .env
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master \
  --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD"
docker compose exec keycloak /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE
```

`sslRequired: none` est acceptable pour un lab local en HTTP. En production, le réglage attendu est `all`, derrière TLS.
