# Script de démonstration

Déroulé en douze étapes, environ cinq minutes. Chaque étape indique ce qu'on montre et ce qu'on dit.

## Préparation

```bash
docker compose up -d
cd backend  && npm run dev     # http://localhost:4000
cd frontend && npm run dev     # http://localhost:3000
```

Pour repartir d'une démonstration vierge :

```bash
cd backend
npx prisma migrate reset --force
npx prisma db seed
```

Garder un terminal ouvert : deux étapes se jouent en ligne de commande, et ce sont les plus convaincantes.

## 1. Le décor

> « Quatre composants, et chacun tient un des quatre rôles d'OAuth 2.0. Keycloak est l'Authorization Server, le frontend Next.js est le Client, l'API Express est le Resource Server, et l'utilisateur est le Resource Owner. J'aurais pu tout mettre dans Next.js, mais alors la validation du jeton aurait disparu dans une bibliothèque. »

Montrer l'accueil : http://localhost:3000

## 2. La connexion

Cliquer sur « Se connecter avec Keycloak », se connecter en `user`.

> « La page de login n'est pas la mienne, c'est celle de Keycloak. Mon application ne voit jamais le mot de passe. C'est tout l'intérêt du SSO : la politique de mot de passe, le MFA et la désactivation au départ sont centralisés. »

Insister sur le flux : Authorization Code + PKCE. Un code à usage unique, échangé côté serveur contre les jetons.

## 3. Le profil et les claims

Aller sur **Profil**.

> « Voici le contenu réel du jeton. Trois choses à remarquer. »

- **`sub`** — l'identifiant stable. C'est lui qui sert de clé en base, pas l'email, qui peut changer.
- **`aud`** — un tableau contenant `identity-lab-api`. Sans l'audience mapper configuré dans Keycloak, ce serait `account`, et vérifier l'audience ne servirait à rien.
- **Le compte à rebours** — le jeton expire en 5 minutes.

Montrer la section « Vu par l'API Express » :

> « La même identité, reconstituée par un service séparé qui a revérifié lui-même la signature, l'issuer, l'audience et l'expiration. »

## 4. L'accès refusé

Aller sur `/admin`.

> « 403, et pas 401. La distinction compte : 401 veut dire je ne sais pas qui vous êtes, 403 veut dire je le sais et ce n'est pas suffisant. »

Le lien « Admin » n'apparaît d'ailleurs pas dans la barre de navigation. Mais le masquer n'est pas ce qui protège — étape 10.

## 5. La demande d'accès

**Demander** → rôle `admin`, justification.

> « Aucun compte ne démarre avec des droits d'administration. Un accès se demande, se justifie, et la justification est conservée : c'est elle qui explique, six mois plus tard, pourquoi cet accès a été accordé. »

Montrer **Mes demandes** : statut « en attente ».

## 6. La séparation des tâches

Rester connecté en `user` et tenter d'approuver — ou mieux, se connecter en `manager`, déposer une demande pour soi-même et tenter de l'approuver.

> « Personne ne valide sa propre demande, quel que soit son rôle. Sans cette règle, un manager pourrait se demander les droits admin et se les accorder. La tentative est refusée et journalisée. »

## 7. L'approbation

Se connecter en `manager`, aller sur **À valider**, saisir un commentaire, approuver.

> « L'approbation met à jour la demande et crée l'accès dans une seule transaction, avec les deux traces d'audit. Soit tout est écrit, soit rien : un accès accordé sans trace serait inexplicable. »

## 8. L'accès existe

Revenir en `user`, aller sur **Mes accès**.

> « L'accès est actif, rattaché à qui l'a accordé et à la justification d'origine. »

Retourner sur `/admin` : la page s'ouvre.

## 9. Le journal d'audit

En `manager`, aller sur **Audit**.

> « Qui a fait quoi, sur quoi, quand, avec quel résultat. Les refus figurent au même titre que les succès — un journal qui ne contiendrait que des succès ne servirait à rien en cas d'incident. »

Montrer les métadonnées d'une tentative refusée : rôle requis, rôles détenus, ou motif de séparation des tâches.

## 10. La preuve que la sécurité n'est pas dans l'interface

Au terminal :

```bash
source .env
TOKEN=$(curl -s -X POST "$KEYCLOAK_ISSUER/protocol/openid-connect/token" \
  -d "client_id=identity-lab-web" -d "client_secret=$KEYCLOAK_CLIENT_SECRET" \
  -d "username=user" -d "password=$DEMO_USER_PASSWORD" \
  -d "grant_type=password" | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/audit-logs | jq
```

> « Je contourne complètement le frontend. L'API refuse quand même, parce que c'est elle qui décide. Masquer un lien n'a jamais protégé un endpoint. »

Puis, la démonstration la plus courte de pourquoi on ne décode jamais un JWT sans le vérifier :

```bash
NONE=$(node -e '
const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const now=Math.floor(Date.now()/1000);
console.log(b({alg:"none",typ:"JWT"})+"."+b({iss:process.argv[1],aud:"identity-lab-api",
  sub:"pirate",exp:now+3600,realm_access:{roles:["admin"]}})+".");
' "$KEYCLOAK_ISSUER")

curl -s -H "Authorization: Bearer $NONE" http://localhost:4000/api/me | jq
```

> « J'ai forgé un jeton non signé qui se déclare administrateur. L'API le rejette : les algorithmes sont épinglés à RS256. Sans cette contrainte, on ferait implicitement confiance à l'en-tête du jeton. »

## 11. La révocation

En `manager`, aller sur **Accès**, saisir un motif, révoquer.

Revenir en `user` : `/admin` renvoie de nouveau 403, et le profil affiche des droits effectifs réduits.

> « Le jeton n'a pas changé, il est toujours valide. Ce sont les droits qui ont changé. »

## 12. Le point de conception à retenir

> « C'est la question qu'on me pose toujours : un JWT signé ne peut pas être révoqué avant son expiration. Ma réponse est dans le modèle. »

```txt
droits effectifs = rôles du jeton  ∪  rôles des accès actifs en base
```

> « Le jeton ne porte que l'identité et le rôle de base, celui du Joiner, géré par l'IdP. Les droits sensibles vivent en base et sont recalculés à chaque requête. Keycloak répond *qui es-tu*, mon application répond *qu'as-tu le droit de faire, qui te l'a accordé et quand*. C'est exactement la frontière entre un IdP et une solution IGA. »

## Les limites, à énoncer soi-même

- Les rôles accordés ne sont pas propagés à Keycloak : ils n'existent que dans cette application. Un vrai IGA ferait du provisioning via l'Admin API ou SCIM.
- Pas de périmètre managérial : tout manager peut approuver la demande de n'importe qui.
- Pas d'accès temporaire ni de campagne de revue.
- Keycloak tourne en mode développement, `sslRequired` à `none`, sans TLS.

Les énoncer avant qu'on ne les trouve montre qu'on sait où s'arrête le lab.
