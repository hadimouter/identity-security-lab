# Setup Keycloak

## Objectif

Démarrer l'infrastructure du lab, puis configurer le realm, les rôles et les utilisateurs de démonstration.

Le document suit l'ordre des phases. La partie infrastructure est opérationnelle. La configuration du realm est en cours de rédaction, elle sera complétée pendant la phase 2B.

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

Tant que le realm du lab n'existe pas, seul le realm `master` répond. À partir de la phase 2B, la même commande fonctionnera sur `identity-lab`.

### Console d'administration

http://localhost:8080

Identifiants définis par `KEYCLOAK_ADMIN` et `KEYCLOAK_ADMIN_PASSWORD` dans `.env`.

Ce compte administre le serveur Keycloak lui-même. Ce n'est pas un utilisateur du lab.

## 3. Configuration du realm

Cette section sera rédigée pendant la phase 2B, au fur et à mesure de la configuration dans la console.

Étapes prévues :

- création du realm `identity-lab`
- création du client `identity-lab-web` pour le frontend, en client confidentiel
- configuration des redirect URIs et des web origins
- création du client `identity-lab-api` pour servir d'audience à l'API
- ajout d'un audience mapper, pour que l'access token porte `aud: identity-lab-api`
- création des rôles de realm `user`, `manager` et `admin`
- création des trois utilisateurs de démonstration et attribution des rôles
- test du flux de login et lecture des claims du token
- export du realm vers `keycloak/realm-export.json`

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
