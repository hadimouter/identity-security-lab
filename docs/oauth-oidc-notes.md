# Notes OAuth 2.0 et OpenID Connect

## OAuth 2.0 et OIDC

OAuth 2.0 sert à autoriser un accès.

OIDC sert à authentifier un utilisateur.

OIDC est une couche d'identité posée au-dessus d'OAuth 2.0. Il réutilise les mêmes flux et ajoute l'ID token, le scope `openid` et l'endpoint `/userinfo`.

Différence principale :

- OAuth 2.0 : cette application peut-elle appeler cette API ?
- OIDC : qui est l'utilisateur connecté ?

## Les quatre rôles OAuth 2.0

- Resource Owner : l'utilisateur, propriétaire de l'identité
- Client : l'application qui demande l'accès
- Authorization Server : authentifie et émet les jetons
- Resource Server : héberge les ressources protégées et valide les jetons

Dans ce lab :

- Resource Owner : l'utilisateur de démo
- Client : le frontend Next.js, client `identity-lab-web`
- Authorization Server : Keycloak, realm `identity-lab`
- Resource Server : l'API Express

## Flux Authorization Code + PKCE

Flux retenu pour le lab. Les flux Implicit et Password Grant sont dépréciés.

1. L'utilisateur clique sur « Se connecter ».
2. Le frontend redirige vers l'endpoint `/auth` de Keycloak avec `client_id`, `redirect_uri`, `response_type=code`, `scope=openid profile email`, `state` et `code_challenge`.
3. Keycloak affiche sa page de login. Le mot de passe ne transite pas par l'application.
4. Keycloak redirige vers la `redirect_uri` avec un code à usage unique et courte durée.
5. Le frontend échange le code contre des jetons sur l'endpoint `/token`, en serveur à serveur, en fournissant le `code_verifier`.
6. Keycloak renvoie `id_token`, `access_token` et `refresh_token`.
7. Le frontend crée une session et conserve les jetons côté serveur.

### state

Valeur aléatoire renvoyée telle quelle par Keycloak. Protège du CSRF sur le callback.

### PKCE

Le client génère un `code_verifier` aléatoire et envoie son hash SHA-256 à l'étape 2. À l'étape 5, il doit fournir le `code_verifier` original.

Un code intercepté est donc inutilisable sans le verifier.

Défini par la RFC 7636. Prévu au départ pour les clients publics (mobile, SPA), recommandé pour tous les clients depuis OAuth 2.1.

## Les trois jetons

### ID token

- Destinataire : le client
- Contenu : l'identité de l'utilisateur (`sub`, `email`, `name`)
- Format : JWT
- Ne doit jamais être envoyé à une API

### Access token

- Destinataire : le resource server
- Contenu : les droits du porteur (`scope`, rôles)
- Durée par défaut dans Keycloak : 5 minutes
- Ne doit pas servir à identifier l'utilisateur dans le frontend

### Refresh token

- Destinataire : le serveur d'autorisation
- Opaque, permet d'obtenir un nouvel access token
- Durée par défaut : 30 minutes

Dans ce lab, le frontend envoie l'access token à l'API dans l'en-tête `Authorization: Bearer <token>`.

## Claims d'un access token Keycloak

```json
{
  "iss": "http://localhost:8080/realms/identity-lab",
  "sub": "f7c3b2a1-...",
  "aud": "identity-lab-api",
  "exp": 1735689600,
  "iat": 1735689300,
  "azp": "identity-lab-web",
  "email": "manager@example.com",
  "preferred_username": "manager",
  "realm_access": { "roles": ["manager", "default-roles-identity-lab"] }
}
```

Claims utilisés dans le lab :

- `iss` : qui a émis le jeton. Un jeton venant d'un autre realm doit être rejeté.
- `sub` : identifiant stable de l'utilisateur. Sert de clé de mapping vers la table `users`. On n'utilise pas l'email, qui peut changer.
- `aud` : à qui le jeton est destiné. Empêche le rejeu d'un jeton émis pour une autre API.
- `exp` : expiration.
- `azp` : le client à l'origine de la demande.
- `realm_access.roles` : les rôles de realm, base du RBAC.

Détail de configuration : par défaut Keycloak met `aud: account`, pas le nom de l'API. Sans audience mapper, la vérification de l'audience ne sert à rien. Voir [keycloak-setup.md](keycloak-setup.md).

## Validation d'un jeton côté API

Un JWT est signé, pas chiffré. N'importe qui peut le lire, seul Keycloak peut en produire un valide.

Ordre de vérification :

1. Signature valide en RS256, avec la clé publique de Keycloak
2. `iss` correspond au realm attendu
3. `aud` contient l'identifiant de l'API
4. `exp` non dépassé
5. Ensuite seulement, lecture de `sub` et `realm_access.roles`

### JWKS

Keycloak publie ses clés publiques sur :

```txt
GET /realms/identity-lab/protocol/openid-connect/certs
```

L'API récupère ce JWKS, sélectionne la clé dont le `kid` correspond à celui de l'en-tête du JWT, et vérifie la signature. Les clés sont mises en cache et rafraîchies automatiquement, ce qui permet à Keycloak de faire tourner ses clés sans casser l'API.

La validation est donc locale. L'API n'appelle pas Keycloak à chaque requête.

Contrepartie : un JWT valide ne peut pas être révoqué avant son expiration. La parade retenue dans le lab est décrite dans [rbac-model.md](rbac-model.md).

### Erreurs à éviter

- Décoder le JWT sans vérifier la signature
- Accepter l'algorithme `none`
- Accepter l'algorithme annoncé dans l'en-tête du jeton au lieu de le forcer à RS256
- Faire confiance à un rôle transmis par le frontend dans un body ou un header

## Logout

Supprimer la session applicative ne déconnecte pas de Keycloak. L'utilisateur qui reclique sur « Se connecter » est reconnecté sans saisir son mot de passe.

Pour un logout complet, appeler l'`end_session_endpoint` :

```txt
GET /realms/identity-lab/protocol/openid-connect/logout
    ?id_token_hint=<id_token>
    &post_logout_redirect_uri=http://localhost:3000
```

- Logout local : la session de l'application est détruite
- Logout SSO : la session Keycloak est détruite, donc toutes les applications du realm

## Endpoint de découverte

Toute la configuration OIDC d'un realm est publiée à une adresse standard :

```bash
curl -s http://localhost:8080/realms/identity-lab/.well-known/openid-configuration | jq
```

Renvoie les endpoints d'autorisation, de token, de logout, l'URI du JWKS et les algorithmes supportés. C'est ce qui permet à une bibliothèque cliente de se configurer à partir de la seule variable `KEYCLOAK_ISSUER`.

## Hors périmètre du lab

- SAML 2.0 : protocole XML antérieur, encore très présent en entreprise. Supporté par Keycloak.
- Client Credentials Grant : flux machine à machine, sans utilisateur. Ce serait la base pour traiter les identités non humaines.
- Token introspection (RFC 7662) : validation en interrogeant Keycloak à chaque requête. Plus lent, mais permet la révocation immédiate.
- DPoP et mTLS : liaison d'un jeton à une preuve de possession, contre le rejeu.
