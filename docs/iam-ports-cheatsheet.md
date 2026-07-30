# Ports et protocoles, fiche IAM

Les ports qu'on croise en Identity & Access Management. Rien d'autre : ni SMTP, ni FTP, ni SNMP, qui n'ont pas de rapport avec l'identité.

Les notions sont dans [network-iam-notes.md](network-iam-notes.md), le diagnostic dans [iam-network-troubleshooting.md](iam-network-troubleshooting.md).

## Web et IAM cloud

| Usage | Protocole | Port | Pourquoi c'est utile IAM |
|---|---|---|---|
| HTTP | TCP | 80 | Sert surtout à rediriger vers HTTPS. Un endpoint OIDC en clair sur 80 est une faute : le code d'autorisation et les jetons y transitent en clair. |
| HTTPS | TCP | 443 | **Le port de tout l'IAM moderne.** OIDC, OAuth 2.0, SAML, Microsoft Graph, les endpoints d'autorisation, de jeton et le JWKS passent tous par là. Si un seul port doit être ouvert en sortie vers un IdP, c'est celui-ci. |
| DNS | UDP puis TCP | 53 | Traduit le nom de l'IdP en adresse. Sans lui, rien ne démarre. UDP par défaut, bascule sur TCP quand la réponse est trop grosse — un firewall qui n'autorise que l'UDP finit par casser certaines résolutions. |
| NTP | UDP | 123 | Synchronise l'horloge. Kerberos tolère **cinq minutes** de dérive, les JWT quelques secondes. Une horloge fausse casse l'authentification sans jamais dire pourquoi. |

## Active Directory et annuaires

| Usage | Protocole | Port | Pourquoi c'est utile IAM |
|---|---|---|---|
| LDAP | TCP | 389 | Interrogation de l'annuaire : chercher un utilisateur, lire ses groupes. **En clair** : le mot de passe d'un bind y traverse le réseau lisible. Constat d'audit fréquent. |
| LDAPS | TCP | 636 | Le même, dans un tunnel TLS. C'est ce qu'on doit exiger dès qu'un mot de passe ou une donnée d'identité circule. |
| Kerberos | TCP et UDP | 88 | Délivrance des tickets par le KDC. C'est le port du SSO Windows : sans lui, plus d'authentification transparente sur les applications internes. |
| Global Catalog | TCP | 3268 | Recherche LDAP **sur toute la forêt**, pas seulement un domaine. Indispensable dès qu'une organisation a plusieurs domaines : une recherche sur 389 ne verrait qu'un domaine. |
| Global Catalog LDAPS | TCP | 3269 | Le Global Catalog chiffré. Même raisonnement que 636. |
| SMB | TCP | 445 | Partages de fichiers Windows. Pas de l'IAM à proprement parler, mais il applique les droits issus de l'annuaire — et c'est un vecteur d'attaque majeur sur les identités. |
| RDP | TCP | 3389 | Bureau à distance. Concerne l'IAM par l'accès privilégié : c'est souvent par là qu'on atteint un serveur d'administration, et **il ne devrait jamais être exposé sur Internet**. |

## Le lab

| Usage | Protocole | Port | Pourquoi c'est utile IAM |
|---|---|---|---|
| Next.js | TCP | 3000 | Le client OIDC. Reçoit la redirection de retour sur `/api/auth/callback/keycloak`, et détient les jetons côté serveur. |
| API Express | TCP | 4000 | Le resource server. Valide chaque jeton et applique le RBAC. Ne devrait jamais être joignable depuis un navigateur. |
| Keycloak | TCP | 8080 | L'authorization server. Porte les endpoints d'autorisation, de jeton, de découverte et le JWKS. |
| PostgreSQL | TCP | 5432 | La base. Publiée sur l'hôte pour le confort de développement — **ce serait une faute en production**, voir plus bas. |

Le lab est entièrement en HTTP : `sslRequired` vaut `none` dans le realm. En production, les ports 3000, 4000 et 8080 disparaîtraient derrière un reverse proxy en 443.

## Ce que dit un port sur un flux

Reconnaître un port, c'est déjà savoir ce qui circule :

```txt
443 vers un IdP        du OIDC ou du SAML, probablement un login
443 sortant d'une API  tres souvent un telechargement de JWKS
389 ou 636             une lecture d'annuaire, ou un bind
88                     une demande de ticket Kerberos
53                     une resolution de nom, toujours en premier
123                    une synchronisation d'horloge
5432, 3306, 1433       une base de donnees, qui ne devrait jamais
                       etre jointe depuis autre chose que son application
```

---

## Ports à connaître, pas à ouvrir aveuglément

Connaître un port ne veut pas dire l'exposer. C'est même l'inverse : plus on en connaît, mieux on sait lesquels **ne doivent pas** être joignables.

### Le moindre privilège réseau

Le même principe que le moindre privilège en IAM, appliqué aux flux. Un flux s'autorise quand il est nécessaire, entre une source et une destination précises, et pas plus.

```txt
Mauvais    ouvrir 636 depuis tout le reseau interne
Bon        ouvrir 636 depuis le serveur applicatif vers les deux
           controleurs de domaine, et rien d'autre
```

Une règle de firewall a quatre champs pour une raison. « Ouvrir le port 636 » n'est pas une règle : c'est une intention mal exprimée.

### La segmentation

Les machines sont regroupées par zone, et les flux entre zones sont filtrés.

```txt
Zone exposee     ce qui est joignable depuis Internet — le reverse proxy
Zone applicative les applications, joignables uniquement par la zone exposee
Zone donnees     les bases, joignables uniquement par la zone applicative
Zone admin       les consoles d'administration, acces restreint
```

Un attaquant qui compromet le reverse proxy n'atteint pas la base : il doit franchir deux frontières supplémentaires, et chacune laisse une trace.

### L'exemple du lab

PostgreSQL est publié sur l'hôte :

```txt
5432/tcp   0.0.0.0:5432->5432/tcp
```

C'est **volontaire et confortable** : on peut inspecter la base avec un client graphique pendant le développement. Ce serait **une faute en production**, pour trois raisons :

```txt
La base n'a aucune raison d'etre jointe par autre chose que l'API
Un port de base expose est scanne en permanence
Une fuite d'identifiants de connexion suffit alors a tout lire,
sans passer par aucun controle d'acces applicatif
```

En production, la base ne serait joignable que depuis le réseau de l'API, et le port ne serait publié nulle part.

### L'accès administrateur

C'est le point le plus sensible, et le plus directement IAM.

```txt
Consoles d'administration    Keycloak, Entra ID, l'annuaire, les bases
RDP et SSH vers les serveurs
Ports d'administration des equipements
```

Aucun de ces accès ne devrait être joignable depuis Internet. Trois façons de les protéger, par sophistication croissante :

**Le bastion.** Une machine unique, durcie et surveillée, par laquelle tout accès d'administration transite. On s'y connecte, puis on rebondit. Avantage : un seul point à surveiller, et tout y est journalisé.

**Le VPN.** L'administrateur entre dans le réseau interne, puis atteint la console. Simple, et grossier : une fois dans le tunnel, il voit beaucoup plus que ce dont il a besoin.

**Le ZTNA.** *Zero Trust Network Access* : plutôt que d'ouvrir un accès au réseau, on publie chaque application individuellement, derrière une vérification d'identité et d'appareil, à chaque requête. C'est le modèle qui remplace progressivement le VPN.

Le rapport avec le reste du dépôt est direct. Le lab applique déjà ce raisonnement à l'échelle applicative : l'API ne fait confiance à personne, revalide le jeton et recalcule les droits à chaque requête, même pour un appel venu de son propre serveur Next.js. Le ZTNA, c'est le même principe appliqué au réseau.

### La règle à retenir

**Un port ouvert est une décision, pas un réglage.** Elle doit pouvoir être justifiée : qui a besoin de joindre quoi, pourquoi, et qui l'a autorisé.

C'est exactement la question que pose ce dépôt à propos des accès applicatifs — qui a demandé, qui a approuvé, pourquoi, et quand faut-il le retirer. Le réseau se gouverne comme les droits.
