# Frontend

Client OIDC du lab, en Next.js App Router. Rôle OAuth 2.0 : client.

L'installation complète est décrite dans le [README à la racine](../README.md). Cette note ne couvre que ce qui est propre à ce dossier.

## Démarrer

```bash
npm install
ln -sfn ../.env .env.local
npm run dev
```

Le lien `.env.local` évite de dupliquer le fichier : Next.js ne lit ses variables que depuis son propre dossier, et il n'y a qu'un seul `.env`, à la racine.

L'API doit tourner sur le port 4000. Sans elle, l'application reste utilisable mais une bande d'avertissement signale que seuls les rôles du jeton sont pris en compte.

## Ce qu'il faut savoir en lisant le code

```txt
auth.ts                        configuration Auth.js, callbacks jwt et session,
                               renouvellement de l'access token
proxy.ts                       fait passer chaque requête par auth() pour que
                               le cookie renouvelé soit réellement réécrit
lib/session.ts                 requireFreshSession(), utilisé par les pages protégées
lib/session-roles.ts           droits effectifs, avec repli restrictif si l'API répond mal
lib/rbac.ts                    matrice des rôles et des écrans
lib/api.ts                     appels serveur vers l'API, avec le Bearer token
app/api/auth/[...nextauth]/    retire l'access token de la réponse servie au navigateur
```

Deux points de sécurité à ne pas défaire :

- Aucun jeton n'est exposé au navigateur. Les appels à l'API partent du serveur Next.js, jamais du client.
- Le masquage des liens et des pages n'est que du confort. L'autorisation qui fait autorité est celle de l'API.
