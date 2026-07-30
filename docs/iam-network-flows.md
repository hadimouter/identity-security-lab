# Flux réseau de l'authentification

Schémas des échanges réseau derrière un login. Chaque flèche est numérotée, puis reprise dans un tableau qui dit qui appelle qui, avec quel protocole, sur quel port, et **ce qui casse si ce flux est bloqué**.

Les notions sont expliquées dans [network-iam-notes.md](network-iam-notes.md). Le diagnostic est dans [iam-network-troubleshooting.md](iam-network-troubleshooting.md).

## Ce qui est réel et ce qui ne l'est pas

```txt
Flux A, B   ce lab, verifies dans le code et testes en direct
Flux C-F    generiques, aucune equivalence dans ce lab
```

Les flux A et B sont exacts au port et à l'URL près. Les flux C à F décrivent des architectures d'entreprise que ce lab ne contient pas : ils sont là pour la compréhension, pas pour être reproduits ici.

---

## A. Le flux OIDC complet du lab

Ce qui se passe entre le moment où l'utilisateur clique sur « Se connecter » et celui où il voit son profil.

```txt
                                 NAVIGATEUR
                                     │
              ┌──────────────────────┼──────────────────────┐
              │ 1                    │ 3                    │ 5
              ▼                      ▼                      ▼
        Next.js :3000  ──2──►  Keycloak :8080  ──4──►  Next.js :3000
        (client OIDC)          (authz server)          /api/auth/callback
                                     ▲                       │
                                     │ 6  serveur a serveur  │
                                     └───────────────────────┘
                                     │
                                     │ 7  jetons
                                     ▼
                              Next.js depose un
                              cookie de session  ──8──►  NAVIGATEUR

        ── ensuite, a chaque page qui affiche des donnees ──

        Next.js :3000  ──9──►  API Express :4000  ──10──►  Keycloak :8080
                                     │                      (JWKS)
                                     │ 11
                                     ▼
                              PostgreSQL :5432
```

| # | De → vers | Protocole | Port | Ce qui transite | Si c'est bloqué |
|---|---|---|---|---|---|
| 1 | Navigateur → Next.js | HTTP | 3000 | clic sur « Se connecter » | l'application ne s'affiche pas |
| 2 | Next.js → Navigateur | HTTP 302 | 3000 | redirection vers Keycloak, avec `client_id`, `redirect_uri`, `state`, `code_challenge` | rien ne part vers l'IdP |
| 3 | Navigateur → Keycloak | HTTP | 8080 | requête d'autorisation | **page de login jamais affichée** |
| 4 | Keycloak → Navigateur | HTTP 302 | 8080 | redirection vers le callback, avec le `code` | l'utilisateur reste bloqué sur Keycloak |
| 5 | Navigateur → Next.js | HTTP | 3000 | le `code` d'autorisation | le retour échoue |
| 6 | Next.js → Keycloak | HTTP POST | 8080 | échange du `code` contre les jetons, avec `client_secret` et `code_verifier` | **échec après la saisie du mot de passe** |
| 7 | Keycloak → Next.js | HTTP | 8080 | `access_token`, `id_token`, `refresh_token` | pas de session |
| 8 | Next.js → Navigateur | HTTP | 3000 | cookie de session chiffré, `HttpOnly` | l'utilisateur n'est jamais reconnu |
| 9 | Next.js → API | HTTP | 4000 | `Authorization: Bearer <access_token>` | bandeau d'avertissement, droits réduits au jeton |
| 10 | API → Keycloak | HTTP GET | 8080 | téléchargement des clés publiques | **login réussi, toute l'API en 401** |
| 11 | API → PostgreSQL | TCP | 5432 | lecture des grants actifs | erreur 500 sur les pages de données |

### Les trois flèches à retenir

**La 3 est la seule que fait le navigateur vers l'IdP.** C'est elle qui affiche la page de login. Si elle échoue, l'utilisateur ne voit jamais de formulaire — le symptôme est net et facile à diagnostiquer.

**La 6 part du serveur, pas du navigateur.** C'est l'échange du code contre les jetons, et il contient le `client_secret` — raison pour laquelle il ne peut pas passer par le navigateur. Si elle échoue, l'erreur apparaît **après** le mot de passe, ce qui oriente à tort vers un problème d'identifiants.

**La 10 part de l'API et n'a lieu qu'une fois**, puis les clés sont en cache. C'est le flux dont l'échec ne ressemble pas à sa cause : le login fonctionne parfaitement et tout le reste renvoie 401.

### Ce qui ne transite jamais

```txt
Le mot de passe        uniquement entre le navigateur et Keycloak, fleche 3
                       ni Next.js ni l'API ne le voient jamais

Les jetons             restent cote serveur Next.js
                       le navigateur ne recoit que le cookie de la fleche 8

Le client_secret       uniquement sur la fleche 6, serveur a serveur
```

C'est le principe BFF, et c'est ce qui distingue ce lab d'une application qui stockerait le jeton dans le navigateur.

---

## B. Le flux d'appel d'API avec un access token

Détail des flèches 9 à 11, avec ce que fait l'API à chaque étape.

```txt
   Next.js (serveur)
        │
        │  1   Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
        ▼
   API Express :4000
        │
        │  2   telecharge le JWKS, une seule fois puis cache
        ├──────────────────────────► Keycloak :8080
        │                            /protocol/openid-connect/certs
        │  3   verifie le jeton, localement, sans appel reseau
        │
        │  4   SELECT sur les grants actifs
        ├──────────────────────────► PostgreSQL :5432
        │
        │  5   droits effectifs = roles du jeton  U  roles des grants
        ▼
   200, 401 ou 403
```

### Étape 3, le détail des vérifications

Elles s'exécutent dans cet ordre, et **la première qui échoue est celle dont vous voyez le message** :

```txt
1  le jeton est-il un JWT lisible ?          sinon  401  jeton mal forme
2  son kid figure-t-il dans le JWKS ?        sinon  401  cle inconnue
3  la signature est-elle valide ?            sinon  401  signature invalide
4  l'algorithme est-il RS256 ?               sinon  401  algorithme refuse
5  l'issuer correspond-il ?                  sinon  401  claim iss invalide
6  l'audience contient-elle identity-lab-api ? sinon 401 claim aud invalide
7  exp est-il depasse ?                      sinon  401  jeton expire
```

Aucune de ces sept vérifications ne demande d'appel réseau. Les clés sont déjà en cache.

### Étape 5, la décision

```txt
Aucun jeton, ou jeton invalide          401   « je ne sais pas qui vous etes »
Jeton valide, role insuffisant          403   « je le sais, ce n'est pas assez »
Jeton valide, role suffisant            200
```

Les droits effectifs sont recalculés **à chaque requête**, en réunissant les rôles portés par le jeton et ceux des grants encore actifs en base. C'est ce qui rend une révocation immédiate malgré un jeton non révocable.

### Ce qui casse à chaque flèche

| Flèche bloquée | Symptôme | Piège |
|---|---|---|
| 1 | l'application affiche un bandeau, droits réduits aux rôles du jeton | repli volontairement restrictif |
| 2 | **toutes** les requêtes en 401 | le login fonctionne, ce qui égare complètement |
| 4 | 500 sur les pages de données | l'authentification marche, l'autorisation non |

---

## C. Le flux Active Directory classique

**Pas dans ce lab.** Architecture d'entreprise typique, applications internes antérieures au web moderne.

```txt
   Application interne
        │
        │  1   bind LDAP : DN + mot de passe
        ▼
   Controleur de domaine :389 ou :636
        │
        │  2   recherche de l'utilisateur
        │      filtre : (&(objectClass=user)(sAMAccountName=mdubois))
        │
        │  3   lecture de l'attribut memberOf
        ▼
   CN=Finance Admins,OU=Groupes,DC=contoso,DC=com
   CN=Standard Users,OU=Groupes,DC=contoso,DC=com
        │
        │  4   l'application traduit les groupes en droits
        ▼
   Acces accorde ou refuse
```

| # | De → vers | Protocole | Port | Ce qui transite |
|---|---|---|---|---|
| 1 | Application → contrôleur | LDAP ou LDAPS | 389 ou 636 | DN et **mot de passe** |
| 2 | Application → contrôleur | LDAP | 389 ou 636 | filtre de recherche |
| 3 | Contrôleur → application | LDAP | 389 ou 636 | attributs, dont `memberOf` |
| 4 | interne | — | — | décision d'autorisation |

### Les deux problèmes de ce flux

**L'application voit le mot de passe.** À l'étape 1, elle l'a en clair dans sa mémoire pour effectuer le bind. C'est exactement ce que le SSO élimine : dans le flux A, seul Keycloak voit le mot de passe.

**En LDAP simple, le mot de passe traverse le réseau en clair.** Le port 389 n'est pas chiffré. C'est un constat d'audit fréquent, et la raison pour laquelle on impose LDAPS sur 636 ou le bind signé.

### Ce que ça deviendrait en moderne

L'application ne parlerait plus à l'annuaire. Elle déléguerait à un IdP en OIDC — exactement le flux A — et lirait les rôles dans le jeton. L'annuaire resterait la source, mais derrière l'IdP.

---

## D. Le flux Kerberos simplifié

**Pas dans ce lab.** C'est le SSO Windows, celui qui fait qu'on n'a jamais à ressaisir son mot de passe sur les applications internes.

```txt
   Poste Windows                          KDC
   (utilisateur connecte)          (controleur de domaine)
        │                                  │
        │  1  ouverture de session         │
        ├─────────────────────────────────►│
        │                                  │
        │  2  TGT, valable ~10 heures      │
        │◄─────────────────────────────────┤
        │                                  │
   ── l'utilisateur ouvre une application interne ──
        │                                  │
        │  3  je veux un ticket pour       │
        │     HTTP/app.contoso.com         │
        │     (je presente mon TGT)        │
        ├─────────────────────────────────►│
        │                                  │
        │  4  ticket de service            │
        │◄─────────────────────────────────┤
        │
        │  5  presentation du ticket
        ▼
   Application interne
        │
        │  6  verification LOCALE du ticket
        │     aucun appel au KDC
        ▼
   Acces accorde
```

| # | De → vers | Protocole | Port | Ce qui transite |
|---|---|---|---|---|
| 1 | Poste → KDC | Kerberos | 88 | demande de TGT |
| 2 | KDC → poste | Kerberos | 88 | TGT chiffré |
| 3 | Poste → KDC | Kerberos | 88 | TGT + nom du service demandé |
| 4 | KDC → poste | Kerberos | 88 | ticket de service |
| 5 | Poste → application | HTTP | 80 ou 443 | ticket, dans un en-tête `Authorization: Negotiate` |
| 6 | interne | — | — | vérification locale |

### Les trois points à retenir

**Le mot de passe ne circule jamais** après l'étape 1. Seuls des tickets chiffrés transitent.

**L'étape 6 ne fait aucun appel réseau.** L'application vérifie le ticket seule, avec une clé partagée avec le KDC. C'est exactement le raisonnement du JWT signé du flux B : la vérification est locale, l'émetteur n'est pas consulté.

**L'heure système est critique.** Les tickets sont horodatés, la tolérance par défaut est de **cinq minutes**. Au-delà, plus rien ne s'authentifie, et aucun message d'erreur ne parle d'heure.

---

## E. Le flux Entra ID en cloud

**Pas dans ce lab.** C'est la même mécanique que le flux A, avec un IdP qui appartient à Microsoft.

```txt
   NAVIGATEUR
        │
        │  1   ouvre l'application
        ▼
   Application SaaS
        │
        │  2   redirection
        ▼
   login.microsoftonline.com                    ◄── nom a resoudre
        │                                           et a autoriser
        │  3   authentification
        │      + evaluation de l'acces conditionnel
        │
        │  4   redirection avec le code
        ▼
   Application, sur sa redirect URI
        │
        │  5   echange code -> jetons, serveur a serveur
        ├────────────────────────────► token endpoint
        │
        │  6   appel avec Bearer
        ▼
   API protegee
        │
        │  7   telechargement des cles
        ├────────────────────────────► /discovery/v2.0/keys
        ▼
   200 / 401 / 403
```

| # | De → vers | Protocole | Port | Si c'est bloqué |
|---|---|---|---|---|
| 1 | Navigateur → application | HTTPS | 443 | l'application ne s'ouvre pas |
| 2 | redirection | HTTPS | 443 | — |
| 3 | Navigateur → Microsoft | HTTPS | 443 | **aucun login possible dans toute l'entreprise** |
| 4 | redirection | HTTPS | 443 | — |
| 5 | Application → Microsoft | HTTPS | 443 | échec après le mot de passe |
| 6 | Application → API | HTTPS | 443 | l'API n'est pas appelée |
| 7 | API → Microsoft | HTTPS | 443 | toute l'API en 401 |

### Les différences avec votre lab

```txt
Tout est en HTTPS sur 443       un seul port a autoriser, mais un nom
                                a resoudre et a laisser passer

login.microsoftonline.com       doit etre joignable depuis chaque poste
                                ET depuis chaque serveur qui valide

L'acces conditionnel            s'intercale a l'etape 3
                                MFA, appareil conforme, localisation

Aucune maitrise de l'IdP        pas de redemarrage, pas de journaux systeme
```

**Ne jamais mettre une adresse IP en dur** dans une règle de firewall visant Microsoft : le nom pointe vers une chaîne de trois alias avant d'aboutir à des adresses gérées dynamiquement. Les règles se font sur le nom, ou sur les plages publiées par Microsoft.

### La correspondance terme à terme

```txt
Votre lab                        Entra ID
realm identity-lab               tenant
client identity-lab-web          app registration
                                 + enterprise application
KEYCLOAK_ISSUER                  login.microsoftonline.com/{tenant}/v2.0
/protocol/openid-connect/certs   /discovery/v2.0/keys
```

Le flux est identique. Le code de votre API fonctionnerait contre Entra ID en changeant l'issuer et l'audience.

---

## F. Le flux avec reverse proxy

**Pas dans ce lab.** C'est l'architecture d'entreprise standard, et c'est celle qui produit le bug de SSO le plus fréquent.

```txt
   NAVIGATEUR
        │
        │  1   https://app.company.com
        ▼
   Reverse proxy  (Nginx, Traefik, Application Gateway)
        │                          ◄── le TLS se termine ICI
        │                              le certificat est porte par le proxy
        │  2   http://app-interne:3000
        │      + Host: app.company.com
        │      + X-Forwarded-Proto: https      ◄── LA ligne qui compte
        │      + X-Forwarded-For: 203.0.113.42
        ▼
   Application interne
        │
        │  3   fabrique sa redirect_uri
        │      a partir de ce qu'elle croit etre son URL publique
        ▼
   IdP
        │
        │  4   compare avec la redirect_uri declaree
        ▼
   OK, ou erreur
```

### Le déroulé quand `X-Forwarded-Proto` manque

C'est le scénario à savoir raconter :

```txt
1  l'utilisateur ouvre https://app.company.com
2  le reverse proxy termine le TLS et transmet en http://
3  X-Forwarded-Proto est absent, ou l'application ne le lit pas
4  l'application se croit en HTTP
5  elle fabrique  redirect_uri = http://app.company.com/callback
6  elle redirige vers l'IdP avec cette valeur
7  l'IdP compare avec ce qui est declare : https://app.company.com/callback
8  ca ne correspond pas  ->  erreur redirect_uri mismatch
```

**L'utilisateur voit l'erreur à l'étape 8. La cause est à l'étape 3.** Cinq étapes se sont bien passées entre les deux, et c'est ce qui rend le diagnostic difficile.

### Les deux variantes du même problème

**Cookies non déposés.** L'application se croit en HTTP, donc elle ne pose pas de cookie `Secure` — ou elle le pose et le navigateur le refuse, puisque la page est en HTTPS côté navigateur. La session ne s'établit jamais.

**Boucle de redirection.** L'application redirige vers l'IdP, l'IdP renvoie, la session ne s'établit pas faute de cookie, l'application redirige de nouveau. Le navigateur abandonne avec « trop de redirections ».

### Ce que le reverse proxy doit garantir

```txt
Host                le nom public, pas le nom interne
X-Forwarded-Proto   https, sinon toute la chaine OIDC se trompe d'URL
X-Forwarded-For     l'IP reelle du client, sinon l'audit enregistre
                    toujours l'adresse du proxy
```

Et côté application : elle doit être **configurée pour faire confiance** à ces en-têtes. La plupart des frameworks ne les lisent pas par défaut, précisément parce qu'un en-tête est falsifiable par le client s'il atteint l'application directement — d'où la règle : ne faire confiance à ces en-têtes que si l'application n'est joignable **que** par le proxy.

### Pourquoi ce lab ne connaît pas ce problème

Le navigateur parle directement à Next.js sur le port 3000, sans intermédiaire. Next.js connaît sa propre URL, il n'y a rien à rétablir.

Attention au vocabulaire : le fichier `frontend/proxy.ts` du lab **n'est pas un reverse proxy**. C'est le middleware Next.js, que le framework a renommé `proxy`. La collision de noms est du fait de Next.js.
