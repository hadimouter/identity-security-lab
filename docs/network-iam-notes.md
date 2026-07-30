# Réseau utile en IAM

Notes de fond sur le réseau, limitées à ce qui sert vraiment en Identity & Access Management. Ce n'est pas un cours réseau général : ni modèle OSI, ni sous-réseaux, ni routage. Uniquement ce sans quoi on ne peut pas répondre à la question « pourquoi le SSO ne marche pas ».

Trois documents complètent celui-ci :

- les schémas de flux : [iam-network-flows.md](iam-network-flows.md)
- le diagnostic pas à pas : [iam-network-troubleshooting.md](iam-network-troubleshooting.md)
- la fiche des ports : [iam-ports-cheatsheet.md](iam-ports-cheatsheet.md)

## Convention de lecture

La moitié des notions ci-dessous n'existe pas dans ce lab. Les confondre serait la pire façon de les apprendre, donc chaque section est marquée.

```txt
Dans le lab       DNS, ports, cookies httpOnly, JWKS, validation de jeton,
                  redirect_uri, issuer, audience
Pas dans le lab   TLS, reverse proxy, firewall, VPN, LDAP, Kerberos,
                  Active Directory, Entra ID
```

Pour ce qui n'y est pas, j'indique à chaque fois **ce qui changerait concrètement dans le lab** si on l'ajoutait. C'est ce qui rend la notion tangible plutôt qu'abstraite.

---

## A. Pourquoi le réseau compte en IAM

Un login, vu de l'utilisateur, c'est un formulaire et un mot de passe. Vu du réseau, c'est autre chose.

Voici ce que déclenche une seule connexion dans ce lab :

```txt
1   le navigateur resout localhost                         -> fichier hosts
2   le navigateur ouvre une connexion TCP vers :3000        -> Next.js
3   Next.js renvoie une redirection vers :8080              -> Keycloak
4   le navigateur ouvre une connexion TCP vers :8080
5   Keycloak affiche son formulaire, recoit le mot de passe
6   Keycloak redirige vers :3000/api/auth/callback/keycloak
7   le navigateur suit la redirection vers :3000
8   Next.js appelle le token endpoint de Keycloak, serveur a serveur
9   Keycloak renvoie les jetons
10  Next.js depose un cookie de session dans le navigateur
11  Next.js appelle l'API sur :4000, serveur a serveur
12  l'API telecharge les cles publiques de Keycloak sur :8080
13  l'API interroge PostgreSQL sur :5432
```

Treize étapes, quatre services, deux acteurs différents qui parlent au réseau — le navigateur pour les étapes 1 à 7 et 10, le serveur Next.js pour les étapes 8 et 11, l'API pour les étapes 12 et 13.

**C'est la conséquence à retenir : une authentification est un problème distribué, pas un problème de mot de passe.** Il suffit qu'un seul de ces treize maillons casse pour que le login échoue. Et le message affiché à l'utilisateur ne dira presque jamais lequel.

C'est ce qui explique pourquoi on attend d'un profil IAM qu'il sache lire une trace réseau. Pas pour configurer des routeurs, mais pour dire lequel des treize maillons a lâché.

### Le point le plus mal compris

Les étapes 8, 11 et 12 partent d'un **serveur**, pas du navigateur. Beaucoup de développeurs supposent que tout part du navigateur, et cherchent des heures du côté du poste utilisateur un problème qui vient du serveur.

Concrètement, dans ce lab : si votre navigateur atteint Keycloak mais que le serveur Next.js ne l'atteint pas, vous verrez le formulaire de login, vous saisirez votre mot de passe, et l'échange du code contre les jetons échouera. Le symptôme apparaît après le mot de passe, ce qui oriente naturellement — et faussement — vers un problème d'identifiants.

---

## B. DNS

### Ce que c'est

DNS traduit un nom en adresse IP. `login.microsoftonline.com` devient `40.126.32.134`. Sans cette traduction, aucune connexion ne peut commencer : les machines ne savent router que des adresses.

C'est la toute première étape de n'importe quel échange, et donc le premier endroit où tout peut s'arrêter.

### Les quatre notions qui suffisent

```txt
Domaine        microsoftonline.com
Sous-domaine   login.microsoftonline.com — une subdivision du domaine
Enregistrement A     un nom -> une adresse IP.  auth.company.com -> 10.2.3.4
Enregistrement CNAME un nom -> un autre nom, un alias
```

Un CNAME sert à déléguer. Plutôt que d'écrire une adresse IP qui changera, on pointe vers un nom géré par quelqu'un d'autre.

Microsoft en est un bon exemple. Voici la vraie chaîne, obtenue avec `dig` :

```txt
login.microsoftonline.com      CNAME  login.mso.msidentity.com
login.mso.msidentity.com       CNAME  ak.privatelink.msidentity.com
ak.privatelink.msidentity.com  CNAME  www.tm.a.prd.aadg.akadns.net
www.tm.a.prd.aadg.akadns.net   A      40.126.32.134
                               A      40.126.32.136
```

Trois alias en cascade, puis plusieurs adresses. Cette indirection permet à Microsoft de rediriger le trafic vers un autre centre de données sans que personne n'ait à changer quoi que ce soit.

Retenir aussi le **TTL**, la durée de vie d'une réponse en cache. Un TTL de 300 signifie qu'un changement peut mettre cinq minutes à se propager. C'est ce qui explique qu'une correction DNS ne prenne pas effet immédiatement.

### Pourquoi un IdP a besoin d'un nom stable

C'est le point le plus important de cette section, et il est spécifique à l'IAM.

L'`issuer` d'un IdP est une **URL**, et cette URL est inscrite dans chaque jeton émis. Dans votre lab :

```txt
issuer  http://localhost:8080/realms/identity-lab
```

Votre API compare ce champ **caractère par caractère** avec ce qu'elle attend. Pas de normalisation, pas de tolérance. `http://localhost:8080/...` et `http://127.0.0.1:8080/...` sont deux issuers différents, même s'ils désignent la même machine.

Conséquence : **changer le nom d'un IdP invalide tous les jetons en circulation**. C'est pour ça qu'on choisit un nom neutre et durable — `auth.company.com` plutôt que `keycloak-prod-01.company.com`, qui deviendrait faux au premier remplacement de serveur.

### Dans le lab

Le lab n'utilise pas DNS du tout. `localhost` est résolu localement, par le fichier `/etc/hosts`, sans qu'aucune requête ne sorte de la machine.

C'est pratique et c'est trompeur : le lab ne connaîtra jamais de panne DNS, alors que c'est une des premières causes de panne en production. Les trois valeurs qui contiennent un nom d'hôte :

```txt
KEYCLOAK_ISSUER  http://localhost:8080/realms/identity-lab
AUTH_URL         http://localhost:3000
API_URL          http://localhost:4000
redirect_uri     http://localhost:3000/api/auth/callback/keycloak
```

### En production

Ces quatre valeurs porteraient de vrais noms — `auth.company.com`, `app.company.com` — qui doivent tous résoudre, **depuis chaque machine concernée**. C'est la nuance à connaître : le navigateur et le serveur ne résolvent pas forcément pareil. Un serveur dans un réseau privé peut avoir un DNS interne qui répond différemment du DNS public. Un IdP joignable depuis votre poste et injoignable depuis le serveur applicatif est une panne très classique, et elle se diagnostique en lançant `dig` **depuis le serveur**, pas depuis son poste.

### Ce que je simplifie

Récursion, serveurs racine, délégation de zone, DNSSEC, split-horizon. Utile à un ingénieur réseau, pas nécessaire pour déboguer un SSO.

---

## C. TLS et HTTPS

### La différence

HTTP transporte en clair. Toute machine sur le chemin peut lire et modifier. HTTPS, c'est HTTP dans un tunnel TLS : chiffré, et surtout **authentifié**.

Le second point est le plus important et le plus oublié. TLS ne sert pas seulement à cacher : il sert à prouver que le serveur en face est bien celui qu'on croit. Sans cette preuve, le chiffrement ne servirait à rien — on chiffrerait très bien une conversation avec un attaquant.

### Le certificat

Le serveur présente un certificat : un document signé qui associe un nom de domaine à une clé publique. Le navigateur vérifie trois choses :

```txt
1  le nom demande figure-t-il dans le certificat ?
2  le certificat est-il signe par une autorite en qui je confiance ?
3  la date du jour est-elle dans la periode de validite ?
```

### La chaîne de confiance

Un certificat n'est presque jamais signé directement par une autorité racine. Il y a une chaîne :

```txt
Certificat du serveur  login.microsoftonline.com
   signe par           Microsoft TLS G2 RSA CA OCSP 10   (intermediaire)
      signe par        une autorite racine presente dans votre systeme
```

Le client remonte la chaîne jusqu'à une racine qu'il connaît. Les racines sont installées avec le système d'exploitation ou le navigateur.

**Le piège classique** : un serveur mal configuré envoie son certificat sans les intermédiaires. Le navigateur, qui les met souvent en cache, accepte ; `curl` sur un serveur, qui n'a rien en cache, refuse. Résultat : « ça marche dans mon navigateur mais mon API n'arrive pas à joindre l'IdP ». C'est un des rares cas où le navigateur est plus permissif que la ligne de commande.

### CN et SAN

Le **CN**, Common Name, est le champ historique du nom. Le **SAN**, Subject Alternative Name, est la liste des noms couverts.

**Les navigateurs et `curl` ignorent le CN. Seul le SAN fait foi.** C'est vérifiable sur le certificat de Microsoft :

```txt
CN du certificat   stamp2.login.microsoftonline.com
nom demande        login.microsoftonline.com
SAN                login.microsoftonline.com
                   login2.microsoftonline.com
                   loginex.microsoftonline.com
                   stamp2.login.microsoftonline.com
                   ... et d'autres

Resultat de la verification : acceptee
```

Le CN ne correspond pas au nom demandé, et pourtant la connexion est valide, parce que le SAN contient le nom. Un certificat qui n'aurait qu'un CN correct, sans SAN, serait refusé par tous les navigateurs modernes.

### Pourquoi OIDC exige HTTPS en production

Trois raisons, dans l'ordre de gravité.

**Le code d'autorisation transite dans une URL.** À l'étape 6 du flux, Keycloak redirige le navigateur vers `…/callback?code=abc123`. Sans TLS, ce code est lisible par toute machine sur le chemin. Avec le PKCE il n'est pas directement exploitable, mais s'en remettre à une seule protection est un mauvais calcul.

**Les jetons transitent dans les en-têtes.** Un `Authorization: Bearer …` en clair, c'est le jeton offert à qui écoute.

**Les cookies de session ne peuvent pas être protégés.** L'attribut `Secure` empêche un cookie de partir en HTTP. Sans TLS, on ne peut pas le poser, et le cookie de session voyage en clair.

La spécification OAuth 2.0 impose d'ailleurs TLS sur les endpoints d'autorisation et de jeton. Ce n'est pas une recommandation.

### Pourquoi la redirect_uri doit être en HTTPS

La `redirect_uri` est l'adresse où l'IdP renvoie le navigateur avec le code. Si elle est en `http://`, le code arrive en clair sur le dernier saut — celui qui compte le plus, puisque c'est celui qui porte le secret.

En entreprise, les IdP refusent souvent purement et simplement d'enregistrer une `redirect_uri` en `http://`, sauf pour `localhost`, tolérée pour le développement. Entra ID applique exactement cette règle.

### Dans le lab

Le lab est **entièrement en HTTP**. Le realm porte :

```txt
sslRequired : none
```

Keycloak accepte donc du HTTP sur toutes ses adresses.

**Acceptable en local**, parce que rien ne quitte la machine : le trafic passe par l'interface de bouclage, il n'y a pas de réseau à écouter. **Inacceptable ailleurs**, y compris sur un réseau d'entreprise interne.

### Ce que changerait le passage en HTTPS

```txt
sslRequired      none  ->  external
KEYCLOAK_ISSUER  http://…  ->  https://auth.company.com/realms/identity-lab
AUTH_URL         http://localhost:3000  ->  https://app.company.com
redirect_uri     doit etre redeclaree en https:// dans le client Keycloak
cookies          peuvent enfin porter Secure
certificat       a fournir a Keycloak, ou a un reverse proxy devant lui
```

Notez que l'issuer change, donc **tous les jetons émis avant la bascule deviennent invalides**. C'est une opération à préparer, pas à improviser.

### Ce que je simplifie

La poignée de main TLS, les suites cryptographiques, la différence entre TLS 1.2 et 1.3, OCSP, la révocation, le pinning. Rien de tout ça ne sert à diagnostiquer un SSO.

---

## D. Ports et protocoles

### Ce qu'est un port

Une adresse IP désigne une machine. Un port désigne **un service sur cette machine**. `localhost:8080` veut dire « le service qui écoute sur le port 8080 de cette machine ».

C'est ce qui permet à votre lab de faire tourner quatre services sur la même machine sans qu'ils se marchent dessus.

### TCP et UDP

```txt
TCP   etablit une connexion, garantit l'ordre et la reception
      plus lent a demarrer, fiable
      HTTP, HTTPS, LDAP, PostgreSQL, la quasi-totalite de l'IAM

UDP   envoie sans etablir de connexion ni confirmer la reception
      plus rapide, sans garantie
      DNS pour les petites reponses, NTP
```

**Ce qu'il faut retenir pour l'IAM** : tout ce qui vous intéresse est en TCP, sauf DNS et NTP. DNS utilise UDP par défaut pour sa rapidité, et bascule sur TCP quand la réponse dépasse la taille d'un paquet. C'est pour ça qu'un firewall qui n'autorise DNS qu'en UDP finit par casser certaines résolutions.

### Écouter, et être joignable

Deux choses différentes, et la confusion est source de longues heures perdues.

Un service peut **écouter** sur un port sans être **joignable** depuis l'extérieur : un firewall peut bloquer, ou le service peut n'écouter que sur l'interface locale. Inversement, un port ouvert dans un firewall ne sert à rien si aucun service n'écoute derrière.

Les deux se testent séparément — voir le [document de diagnostic](iam-network-troubleshooting.md).

### Dans le lab

```txt
3000   Next.js, le client OIDC
4000   l'API Express, le resource server
8080   Keycloak, l'authorization server
5432   PostgreSQL
```

Les ports 8080 et 5432 sont publiés par Docker Compose sur l'hôte. Le tableau complet, avec les ports d'entreprise, est dans la [fiche des ports](iam-ports-cheatsheet.md).

---

## E. Firewall

### Ce que c'est

Un équipement, ou un logiciel, qui décide quels paquets passent. Une règle tient en quatre champs :

```txt
source        qui emet
destination   vers qui
port          quel service
protocole     TCP ou UDP
action        autoriser ou bloquer
```

Deux directions, et c'est la distinction qui compte.

**Le filtrage entrant** protège des connexions venues de l'extérieur. C'est celui auquel tout le monde pense.

**Le filtrage sortant** limite ce que vos propres machines peuvent joindre. **C'est celui qui casse les SSO**, et presque personne n'y pense en premier.

### Pourquoi le sortant casse les SSO

Reprenez les treize étapes de la section A. Trois d'entre elles sont des connexions **sortantes depuis un serveur** :

```txt
etape 8    Next.js  ->  token endpoint de Keycloak
etape 11   Next.js  ->  API Express
etape 12   API      ->  JWKS de Keycloak
```

Dans une architecture d'entreprise, ces serveurs sont dans un réseau cloisonné, avec une politique sortante restrictive — souvent « tout est bloqué sauf ce qui est explicitement autorisé ». Si personne n'a pensé à autoriser le serveur applicatif vers l'IdP, le login échouera **après** la saisie du mot de passe, ce qui envoie tout le monde chercher du côté des identifiants.

L'étape 12 est encore plus vicieuse. Si le JWKS est injoignable, **le login fonctionne parfaitement** — l'utilisateur se connecte, arrive sur l'application — et chaque appel d'API renvoie 401. Le symptôme ne ressemble pas du tout à sa cause.

### Dans le lab

Aucun firewall. Tout passe par l'interface de bouclage, où rien ne filtre.

### Ce que seraient les règles en production

À titre d'illustration, pas de configuration réelle du lab :

```txt
Autoriser   serveur Next.js  ->  IdP        443/TCP
Autoriser   serveur API      ->  IdP        443/TCP    (pour le JWKS)
Autoriser   serveur API      ->  PostgreSQL 5432/TCP
Autoriser   Internet         ->  reverse proxy  443/TCP
Bloquer     Internet         ->  API directement
Bloquer     Internet         ->  PostgreSQL
Bloquer     tout le reste en sortie
```

La règle la plus importante est la dernière ligne de blocage : **la base de données ne doit être joignable que par l'API**. Dans le lab, PostgreSQL est publié sur l'hôte pour votre confort — c'est un choix de développement qui serait une faute en production.

---

## F. Proxy et reverse proxy

### Attention au vocabulaire de ce dépôt

Le lab contient un fichier `frontend/proxy.ts`. **Ce n'est pas un proxy réseau.** C'est le middleware de Next.js, que le framework a renommé `proxy`. Il exécute Auth.js avant chaque page pour que le cookie de session renouvelé soit bien réécrit.

Rien à voir avec ce qui suit. La collision de noms est malheureuse, elle est du fait de Next.js.

### La différence, par la direction

```txt
Proxy sortant     parle a la place du CLIENT
                  vos machines passent par lui pour sortir
                  vu par le serveur distant : c'est le proxy qui appelle

Reverse proxy     parle a la place du SERVEUR
                  les clients s'adressent a lui, il transmet derriere
                  vu par le client : c'est lui le serveur
```

Le mot « reverse » désigne le renversement du point de vue, pas un fonctionnement inversé.

Exemples : Nginx et Traefik pour les reverse proxies auto-hébergés, Azure Application Gateway côté Microsoft, Cloudflare en service managé.

### Le rôle dans une architecture SSO

Le reverse proxy est presque toujours là en entreprise. Il termine le TLS — c'est lui qui porte le certificat —, il expose un nom public unique, il répartit la charge, et il est souvent le seul composant joignable depuis Internet.

Conséquence directe : **l'application ne voit plus la vraie requête**. Elle voit ce que le reverse proxy lui transmet, et notamment elle reçoit du HTTP alors que l'utilisateur était en HTTPS.

### Les trois en-têtes

C'est le reverse proxy qui doit rétablir l'information perdue :

```txt
Host                le nom demande par le client     app.company.com
X-Forwarded-For     l'adresse IP reelle du client    203.0.113.42
X-Forwarded-Proto   le protocole d'origine           https
```

`X-Forwarded-For` sert à l'audit et aux règles fondées sur l'adresse — sans lui, tous vos journaux enregistrent l'IP du proxy, et vous ne savez plus qui a fait quoi. C'est un point directement IAM : une trace d'audit qui enregistre toujours la même adresse ne vaut rien.

### Le bug de SSO le plus fréquent en entreprise

Il mérite son déroulé complet, parce qu'on vous le posera.

```txt
1  l'utilisateur ouvre https://app.company.com
2  le reverse proxy termine le TLS et transmet en http:// a l'application
3  X-Forwarded-Proto est absent, ou l'application ne le lit pas
4  l'application se croit en HTTP
5  elle fabrique sa redirect_uri :  http://app.company.com/callback
6  elle redirige vers l'IdP avec cette valeur
7  l'IdP compare avec ce qui est declare :  https://app.company.com/callback
8  ca ne correspond pas -> erreur redirect_uri mismatch
```

L'utilisateur voit une erreur à l'étape 8. La cause est à l'étape 3. Entre les deux, cinq étapes qui se sont bien passées.

Deux variantes du même problème :

**Cookies non déposés.** L'application croit être en HTTP, donc elle n'ose pas poser un cookie `Secure` — ou elle le pose et le navigateur le refuse. La session ne s'établit jamais, et l'utilisateur boucle sur le login.

**Boucle de redirection.** L'application redirige vers l'IdP, l'IdP renvoie, la session ne s'établit pas faute de cookie, l'application redirige de nouveau. Le navigateur finit par abandonner avec « trop de redirections ».

Le remède est toujours le même : le reverse proxy doit envoyer `X-Forwarded-Proto`, et l'application doit être configurée pour lui faire confiance.

### Le lien avec OIDC

Trois exigences d'OIDC deviennent fragiles dès qu'un reverse proxy est présent :

```txt
redirect_uri stricte   comparaison exacte, aucune tolerance
issuer stable          inscrit dans chaque jeton, compare caractere par caractere
cookies Secure         dependent du protocole vu par l'application
```

Les trois dépendent de la capacité de l'application à connaître sa **propre URL publique**. C'est la seule chose que le reverse proxy lui cache, et c'est précisément ce dont OIDC a besoin.

### Dans le lab

Aucun reverse proxy. Le navigateur parle directement à Next.js sur le port 3000, Next.js parle directement à Keycloak sur 8080. C'est pour ça que ce lab ne connaîtra jamais ce problème — et pourquoi il faut le connaître par ailleurs.

---

## G. VPN

### Ce que c'est

Un tunnel chiffré entre deux points du réseau. Ce qui y circule est protégé, et surtout la machine se comporte comme si elle était **à l'intérieur** du réseau distant.

```txt
VPN utilisateur    un poste se connecte au reseau de l'entreprise
                   le teletravail classique

VPN site-a-site    deux reseaux relies en permanence
                   un siege et une filiale, ou un datacenter et un cloud
```

### Pourquoi certaines applications ne sont accessibles que par VPN

Parce que c'est le contrôle d'accès le plus simple qui soit : l'application n'est publiée que sur le réseau interne, et il n'existe aucun chemin depuis Internet. Pas de règle à écrire, pas d'authentification à ajouter. On ne peut pas attaquer ce qu'on ne peut pas joindre.

C'est efficace, et c'est aussi la limite du modèle : une fois dans le tunnel, on est « à l'intérieur », et l'intérieur est historiquement peu surveillé.

### L'impact IAM

**Le réseau devient un signal d'autorisation.** C'est exactement ce que fait l'accès conditionnel d'Entra ID : une politique peut exiger le MFA depuis l'extérieur et s'en dispenser depuis le réseau de l'entreprise, ou bloquer purement et simplement certaines connexions selon leur pays d'origine.

C'est utile, et c'est une source d'erreurs. Un utilisateur qui passe du bureau au domicile change de traitement sans rien changer à son identité — et il ne comprend pas pourquoi on lui demande soudain un second facteur.

### Zero Trust

Le modèle qui remplace progressivement le VPN classique. Le principe tient en une phrase : **ne faire confiance à aucun réseau**, et vérifier l'identité et l'état de l'appareil à chaque requête, qu'elle vienne du bureau ou d'un café.

Le sigle ZTNA — Zero Trust Network Access — désigne les produits qui appliquent ce modèle : plutôt que d'ouvrir un tunnel vers tout le réseau, on publie chaque application individuellement, derrière une vérification d'identité.

**Le lien avec ce lab est direct**, et c'est un bon argument à l'oral. Votre API ne fait confiance à personne : elle revalide le jeton et recalcule les droits effectifs à chaque requête, y compris pour un appel qui vient de votre propre serveur Next.js sur la même machine. C'est le principe Zero Trust appliqué à l'échelle d'une application.

### En entreprise

Il est courant que les consoles d'administration IAM ne soient pas exposées sur Internet, et que l'accès administrateur passe par un VPN, un bastion ou une solution ZTNA. Je le formule au conditionnel : je ne connais l'infrastructure d'aucune entreprise en particulier, et affirmer le contraire en entretien serait une erreur.

---

## H. LDAP

### Ce que c'est

Un protocole pour interroger un annuaire. LDAP signifie *Lightweight Directory Access Protocol*, et le mot important est **annuaire** : une base de données hiérarchique, optimisée pour la lecture, qui stocke des identités et des groupes.

Créé bien avant le web. Il ne connaît ni OAuth, ni jetons, ni REST.

### La structure

Hiérarchique, comme un système de fichiers lu à l'envers. Chaque entrée a un **DN**, Distinguished Name, qui est son chemin complet :

```txt
CN=Marie Dubois,OU=Utilisateurs,OU=Paris,DC=contoso,DC=com
 │             │                │        └── DC = Domain Component, le domaine
 │             │                └── une autre unite d'organisation
 │             └── OU = Organizational Unit, un conteneur
 └── CN = Common Name, le nom de l'entree
```

Le DN se lit de droite à gauche : le domaine `contoso.com`, le site de Paris, le conteneur des utilisateurs, puis la personne.

### Les deux opérations

```txt
bind     s'authentifier aupres de l'annuaire
         soit anonyme, soit avec un DN et un mot de passe

search   chercher des entrees
         on donne une base de recherche et un filtre
         exemple de filtre :  (&(objectClass=user)(mail=marie.dubois@contoso.com))
```

**Le bind est aussi une méthode d'authentification.** C'est l'authentification LDAP historique : l'application prend le mot de passe saisi par l'utilisateur et tente un bind avec. Si le bind réussit, le mot de passe est bon.

Ça fonctionne, et c'est mauvais pour deux raisons. **L'application voit le mot de passe en clair** — c'est exactement ce que le SSO élimine. Et sans LDAPS, ce mot de passe traverse le réseau en clair.

### Les attributs

Une entrée porte des attributs. Ceux qui comptent en IAM :

```txt
sAMAccountName       l'identifiant de connexion historique      mdubois
userPrincipalName    l'identifiant moderne, forme email
mail                 l'adresse, qui peut differer de l'UPN
memberOf             les groupes dont l'entree est membre
manager              le DN du responsable
userAccountControl   un ensemble de drapeaux, dont compte desactive
```

`memberOf` est celui qu'on interroge le plus : c'est ainsi qu'une application legacy décide des droits, en demandant à l'annuaire à quels groupes appartient l'utilisateur.

### LDAP et LDAPS

```txt
LDAP    389/TCP    en clair
LDAPS   636/TCP    dans un tunnel TLS
```

En clair signifie que le bind, donc le mot de passe, est lisible sur le réseau. **Un annuaire interrogé en LDAP simple sur un réseau d'entreprise est une faille**, et c'est un constat d'audit fréquent. Microsoft pousse depuis des années vers LDAPS ou vers le bind signé.

### Le lien IAM

Trois usages, par ordre de fréquence.

**Lire les groupes.** Une application interne demande à l'annuaire de quels groupes fait partie l'utilisateur, et en déduit ses droits. C'est du RBAC, avec l'annuaire comme source des rôles.

**Authentifier.** Le bind comme méthode de connexion. C'est du legacy, et on le remplace par OIDC quand on peut.

**Provisionner.** Lire l'annuaire pour créer les comptes dans une application tierce. C'est ce que ferait le module Microsoft Identity de ce dépôt s'il tournait sur un vrai annuaire : `Get-MgUser` est l'équivalent moderne d'un search LDAP.

### Dans le lab

Aucun LDAP. Keycloak sait pourtant se brancher sur un annuaire LDAP comme source d'utilisateurs — c'est une fonctionnalité standard, appelée *User Federation*. Ce serait l'extension naturelle du lab pour pratiquer cette section : Keycloak resterait l'IdP OIDC vu par l'application, mais irait chercher les identités dans l'annuaire.

---

## I. Kerberos

### Pourquoi il existe

Deux problèmes, résolus en 1988 au MIT, et toujours d'actualité.

**Ne pas envoyer le mot de passe sur le réseau.** Ni au serveur applicatif, ni même au serveur d'authentification après la première étape.

**Permettre le SSO.** S'authentifier une fois, puis accéder à plusieurs services sans ressaisir quoi que ce soit.

C'est exactement l'objectif d'OIDC, avec quarante ans d'écart et une hypothèse différente : Kerberos suppose un réseau d'entreprise fermé, OIDC suppose Internet.

### Les pièces

```txt
KDC     Key Distribution Center, l'autorite qui delivre les tickets
        dans Active Directory, c'est le controleur de domaine

TGT     Ticket Granting Ticket, le laissez-passer principal
        obtenu a l'ouverture de session, valable ~10 heures

Service ticket   un ticket pour UN service precis
                 obtenu en presentant le TGT

Realm   le domaine d'authentification, ecrit en majuscules
        CONTOSO.COM
```

### Le principe

```txt
1  ouverture de session : le poste obtient un TGT aupres du KDC
2  l'utilisateur ouvre une application interne
3  le poste demande au KDC un ticket pour CE service, en presentant le TGT
4  le KDC delivre un ticket de service
5  le poste presente le ticket a l'application
6  l'application verifie le ticket, sans jamais contacter le KDC
```

**L'étape 6 est l'élégance du système.** L'application vérifie le ticket toute seule, parce qu'il est chiffré avec une clé qu'elle partage avec le KDC. Pas d'appel réseau supplémentaire, pas de base de sessions.

C'est exactement le raisonnement d'un JWT signé : votre API vérifie le jeton avec la clé publique de Keycloak sans lui demander son avis. Kerberos et OIDC ont résolu le même problème de la même façon, à deux époques différentes.

### Pourquoi l'heure système est critique

Un ticket Kerberos contient un horodatage, et c'est ce qui empêche un attaquant de rejouer un ticket capturé.

**La tolérance par défaut est de cinq minutes.** Au-delà, l'authentification échoue.

Conséquence pratique : un serveur dont l'horloge dérive de six minutes ne peut plus authentifier personne, et le message d'erreur ne parle jamais d'heure. C'est pour ça que la synchronisation NTP est une dépendance critique d'Active Directory, et pas un détail d'exploitation.

Le même piège existe pour les JWT, avec les champs `exp`, `iat` et `nbf`. Une API dont l'horloge avance de dix minutes rejettera des jetons parfaitement valides comme « expirés ». Les bibliothèques prévoient une tolérance de quelques secondes — le *clock skew* —, pas de plusieurs minutes.

### Le lien IAM

**Le SSO Windows.** Un utilisateur connecté à son poste accède aux applications internes sans ressaisir son mot de passe. C'est Kerberos, et c'est transparent au point qu'on ne le remarque pas.

**La délégation.** Un service peut agir au nom de l'utilisateur auprès d'un autre service. Puissant, et c'est aussi une des surfaces d'attaque les plus travaillées d'Active Directory.

### Dans le lab

Aucun Kerberos. Il faudrait un domaine Windows, ce qui sort largement du périmètre.

### Ce que je simplifie

Toute la cryptographie : les clés de session, le chiffrement des tickets, les échanges AS-REQ et TGS-REQ, les SPN. On peut expliquer Kerberos correctement sans, et les détails ne servent qu'à ceux qui font de la sécurité offensive sur AD.

---

## J. Active Directory

### Les pièces

```txt
Controleur de domaine   le serveur qui heberge l'annuaire
                        il est a la fois serveur LDAP et KDC Kerberos

Domaine                 une frontiere administrative      contoso.com
Foret                   un ensemble de domaines lies
OU                      un conteneur de rangement, sur lequel on applique des GPO
GPO                     Group Policy Object, une strategie poussee
                        sur les postes et les serveurs
```

### La phrase à retenir

**Active Directory parle LDAP et Kerberos. Il ne parle ni OAuth, ni OIDC, ni SAML.**

Tout découle de là. AD ne sait pas délivrer un jeton à une application web tierce. Il a été conçu quand les applications étaient installées sur des postes du même réseau. C'est précisément ce qui l'a rendu insuffisant dès que les applications sont parties dans le cloud, et c'est la raison d'être d'Entra ID.

Les deux protocoles ont leur rôle : **Kerberos pour authentifier**, **LDAP pour interroger**. Un poste Windows s'authentifie en Kerberos et lit les groupes en LDAP.

### Pourquoi AD reste omniprésent

Parce qu'il fait des choses qu'Entra ID ne fait pas. Les GPO administrent les postes Windows. Les partages de fichiers, les imprimantes et les serveurs applicatifs internes en dépendent. Vingt ans de configuration s'y sont accumulés.

La plupart des grandes entreprises ont donc **les deux**, synchronisés par Entra Connect : AD reste la source, Entra ID en reçoit une copie pour le cloud.

Cette coexistence est une source de constats d'audit : les comptes existent des deux côtés avec des identifiants différents et des cycles de vie qui peuvent diverger. Un compte désactivé d'un côté et pas de l'autre est un classique.

### Le lien IAM

```txt
Groupes metier     l'appartenance decide des droits applicatifs
Groupes admin      Domain Admins et consorts, le sommet des privileges
Comptes de service comptes utilisateurs detournes pour faire tourner
                   des applications, souvent sans rotation de mot de passe
JML                le cycle Joiner / Mover / Leaver s'applique ici en premier
Comptes desactives desactives mais pas supprimes, gardant leurs appartenances
```

Les deux dernières lignes sont exactement ce que cherchent les scripts du module [Microsoft Identity](../scripts/microsoft-identity/README.md) de ce dépôt.

Détail sur AD et Entra ID côté identité : [microsoft-identity-notes.md](microsoft-identity-notes.md).

---

## K. Microsoft Entra ID, côté réseau

### Ce qui change quand l'IdP est chez Microsoft

L'IdP n'est plus sur votre réseau. Vous ne pouvez ni le redémarrer, ni regarder ses journaux système, ni corriger sa configuration réseau.

Deux conséquences pratiques.

**`login.microsoftonline.com` doit être joignable.** Depuis chaque navigateur, et depuis chaque serveur qui doit valider des jetons. Ce nom figure dans la liste blanche des proxys d'entreprise, et une liste blanche mal tenue casse tous les logins d'un coup.

**Vous dépendez d'un tiers pour la disponibilité.** Une panne Microsoft est une panne de votre authentification, et vous n'avez aucun levier.

### Le nom, et sa chaîne DNS

Vu plus haut en section B : trois CNAME en cascade puis plusieurs adresses, gérées par un service de répartition géographique. **Ne jamais mettre une adresse IP en dur** dans une règle de firewall visant Microsoft : elles changent. Les règles se font sur le nom, ou sur les plages publiées et maintenues par Microsoft.

### Le vocabulaire

```txt
App registration        la definition technique d'une application
                        client_id, secret, redirect URI, permissions
                        l'equivalent d'un client Keycloak

Enterprise application  l'instance de cette application dans VOTRE tenant
                        qui a le droit de s'en servir, quels roles existent
```

La distinction n'a pas d'équivalent dans Keycloak, et c'est ce qui perd tout le monde au début. Une application est **enregistrée** une fois, chez son éditeur, et **instanciée** dans chaque tenant qui l'utilise.

### Les endpoints, en correspondance avec votre lab

```txt
                    Votre lab (Keycloak)                  Entra ID
Issuer              …/realms/identity-lab                 login.microsoftonline.com/{tenant}/v2.0
Autorisation        …/protocol/openid-connect/auth        …/oauth2/v2.0/authorize
Jeton               …/protocol/openid-connect/token       …/oauth2/v2.0/token
JWKS                …/protocol/openid-connect/certs       …/discovery/v2.0/keys
Decouverte          …/.well-known/openid-configuration    …/v2.0/.well-known/openid-configuration
```

**C'est là que votre lab paye.** Les concepts sont identiques : même flux Authorization Code + PKCE, mêmes jetons, même validation par JWKS. Seuls les noms d'URL changent. Le code de votre API fonctionnerait contre Entra ID en modifiant l'issuer et l'audience, sans toucher à la logique.

### Le lien avec l'accès conditionnel

L'accès conditionnel est un moteur de règles qui s'intercale au moment de l'authentification. Une politique peut exiger le MFA, un appareil conforme, ou bloquer selon la localisation.

Le rapport avec le réseau est direct : **la localisation et l'adresse IP sont des conditions**, et c'est ce qui permet à une entreprise de traiter différemment une connexion depuis le bureau et une connexion depuis l'extérieur.

Le piège classique : un compte de service ou un traitement automatisé se fait bloquer par une politique conçue pour des humains, parce qu'il ne peut pas répondre à un défi MFA. C'est une des raisons pour lesquelles ces comptes se retrouvent souvent exclus des politiques — et donc moins protégés que les comptes nominatifs.

---

## L. JWKS et validation de jeton

### Le mécanisme

L'IdP signe chaque jeton avec sa **clé privée**, qu'il ne partage avec personne. N'importe qui peut vérifier la signature avec la **clé publique** correspondante, qu'il publie.

Le JWKS — *JSON Web Key Set* — est le point d'accès qui publie ces clés publiques.

```txt
1  l'API demarre, ou recoit son premier jeton
2  elle telecharge le JWKS de l'IdP
3  elle lit l'en-tete du jeton, qui contient un `kid` (key id)
4  elle cherche la cle correspondante dans le jeu telecharge
5  elle verifie la signature
6  elle verifie ensuite issuer, audience et expiration
```

**L'étape 5 ne demande aucun appel réseau vers l'IdP.** C'est tout l'intérêt : l'IdP peut être injoignable pendant une heure, l'API continue de valider les jetons tant qu'elle a les clés en cache. C'est la même élégance que le ticket Kerberos vérifié localement.

### Le JWKS de votre lab

Adresse :

```txt
http://localhost:8080/realms/identity-lab/protocol/openid-connect/certs
```

Il contient **deux clés**, et savoir pourquoi est un bon détail à connaître :

```txt
kid  6_AoHDyRyr1…   alg RS256      use sig   -> signature, celle qui nous interesse
kid  3u4BvLF4Op1…   alg RSA-OAEP   use enc   -> chiffrement, non utilisee ici
```

Le champ `use` distingue les deux. Une bibliothèque correcte ne retient que celles marquées `sig` pour vérifier une signature.

### Le cache et la rotation

Les IdP changent périodiquement leurs clés de signature. Pendant la transition, **les deux clés sont publiées** : l'ancienne pour les jetons déjà émis, la nouvelle pour les suivants. C'est le `kid` qui permet de choisir.

Une bibliothèque correcte met le jeu de clés en cache et le recharge quand elle rencontre un `kid` inconnu. C'est ce que fait `createRemoteJWKSet` dans votre API. Une implémentation naïve qui téléchargerait le JWKS à chaque requête ferait s'effondrer l'IdP sous la charge.

### Quand le JWKS est injoignable

**Le mode de panne le plus déroutant de tout l'IAM.**

```txt
Le login fonctionne parfaitement.
L'utilisateur arrive sur l'application.
Chaque appel d'API renvoie 401.
```

Pourquoi : le login passe par le navigateur et par le token endpoint. La validation, elle, passe par le JWKS, qui est une connexion **sortante depuis l'API**. Si le firewall bloque cette sortie, ou si le cache expire au mauvais moment, plus rien ne se valide.

Le symptôme ne ressemble pas à sa cause, et c'est ce qui fait perdre des heures. Le réflexe à avoir : quand tout le monde se connecte mais que rien ne fonctionne, **regarder le JWKS avant tout le reste**.

### Ce qui rejette un jeton, dans l'ordre

Votre API effectue les vérifications dans cet ordre, et **la première qui échoue est celle dont vous voyez le message** :

```txt
1  le jeton est-il un JWT lisible ?              sinon : mal forme
2  son kid figure-t-il dans le JWKS ?            sinon : cle inconnue
3  la signature est-elle valide ?                sinon : signature invalide
4  l'algorithme est-il RS256 ?                   sinon : algorithme refuse
5  l'issuer correspond-il ?                      sinon : claim iss invalide
6  l'audience correspond-elle ?                  sinon : claim aud invalide
7  le jeton est-il encore valide ?               sinon : expire
```

L'ordre explique un comportement qui surprend. Un jeton émis par un **autre realm** Keycloak échoue à l'étape 2, pas à l'étape 5 — parce que chaque realm a ses propres clés de signature, et que le `kid` est introuvable avant même qu'on regarde l'issuer. Votre API répond alors :

```txt
Aucune clé du JWKS ne correspond au kid du jeton.
Il vient probablement d'un autre realm ou d'un autre émetteur.
```

C'est un vrai message de votre lab, obtenu en présentant à l'API un jeton du realm `master`.

---

## M. Cookies, sessions et réseau

### Les trois attributs

```txt
HttpOnly   le JavaScript de la page ne peut pas lire le cookie
           protege contre le vol par XSS

Secure     le cookie n'est envoye qu'en HTTPS
           sans lui, le cookie voyage en clair

SameSite   le cookie est-il envoye quand la requete vient d'un autre site ?
           Strict  jamais
           Lax     seulement sur une navigation de premier niveau (defaut)
           None    toujours, et exige Secure
```

### SameSite et OIDC, le piège

Un login OIDC **revient d'un autre site** : c'est l'IdP qui renvoie le navigateur vers votre application.

```txt
SameSite=Strict   le cookie n'est PAS envoye au retour de l'IdP
                  l'application ne reconnait pas la session
                  l'utilisateur boucle sur le login

SameSite=Lax      le cookie EST envoye sur une redirection GET
                  c'est le defaut des navigateurs modernes, et c'est
                  ce qui fait fonctionner OIDC sans configuration
```

À retenir : **`Strict` casse le SSO**, alors que c'est le réglage qui semble le plus sûr. Si un IdP renvoie par POST plutôt que par GET — ce que fait SAML, et OIDC dans certains modes —, même `Lax` ne suffit plus, et il faut `None; Secure`.

### Pourquoi le navigateur ne doit pas voir les jetons

Un jeton dans le stockage du navigateur est lisible par tout JavaScript de la page, donc par n'importe quelle bibliothèque tierce compromise. Un cookie `HttpOnly`, non.

C'est le principe du **BFF**, *Backend For Frontend*, et c'est l'architecture de ce lab. Le navigateur ne détient qu'un cookie de session chiffré ; les jetons restent sur le serveur Next.js, qui appelle l'API pour lui.

Ce n'était pas vrai au début du projet : le point d'accès `/api/auth/session` servait l'access token complet au navigateur, ce qui contredisait la promesse. Le correctif P1 l'a retiré de la réponse.

### Les quatre causes de « cookie non envoyé »

```txt
Domaine incorrect      le cookie a ete pose pour un autre domaine
                       classique avec un reverse proxy qui change le Host

Secure sans HTTPS      le cookie porte Secure et la page est en HTTP
                       le navigateur refuse de l'envoyer

SameSite trop strict   voir plus haut

Chemin trop restreint  le cookie a un Path qui ne couvre pas l'URL appelee
```

Les trois premières se voient dans l'onglet Application des outils de développement, section Cookies. C'est le premier endroit à regarder devant une boucle de login.

### Dans le lab

```txt
HttpOnly   oui, cookie de session chiffre par Auth.js
Secure     non, le lab est en HTTP
SameSite   valeur par defaut, donc Lax
```

`Secure` est absent uniquement parce qu'il n'y a pas de TLS. En production, il serait indispensable — et il le deviendrait automatiquement si le lab passait en HTTPS, Auth.js posant l'attribut selon le protocole de `AUTH_URL`.

---

## N. Erreurs réseau classiques

Tableau de renvoi. **La procédure de diagnostic complète, avec les commandes et l'interprétation, est dans [iam-network-troubleshooting.md](iam-network-troubleshooting.md)** — je ne la duplique pas ici.

| Symptôme visible | Cause probable | Où aller |
|---|---|---|
| La page de login ne s'affiche pas du tout | IdP injoignable, DNS ou port | [cas A](iam-network-troubleshooting.md#a--lidp-est-injoignable) |
| Erreur après la saisie du mot de passe | le serveur applicatif ne joint pas le token endpoint | [cas A](iam-network-troubleshooting.md#a--lidp-est-injoignable) |
| `Invalid parameter: redirect_uri` | l'URL de retour ne correspond pas à celle déclarée | [cas E](iam-network-troubleshooting.md#e--redirect_uri-mismatch) |
| Le login marche, mais toute l'API répond 401 | JWKS injoignable | [cas C](iam-network-troubleshooting.md#c--le-jwks-est-injoignable) |
| `claim iss invalide` | l'issuer attendu ne correspond pas à celui du jeton | [cas B](iam-network-troubleshooting.md#b--lissuer-ne-correspond-pas) |
| `claim aud invalide` | jeton destiné à une autre application | [cas F](iam-network-troubleshooting.md#f--audience-invalide) |
| `Aucune clé du JWKS ne correspond au kid` | jeton d'un autre realm ou d'un autre émetteur | [cas C](iam-network-troubleshooting.md#c--le-jwks-est-injoignable) |
| Jeton refusé alors qu'il vient d'être émis | horloge du serveur décalée | [cas L](iam-network-troubleshooting.md#l--horloge-du-serveur) |
| `certificate has expired` | certificat TLS périmé | [cas I](iam-network-troubleshooting.md#i--tls-et-certificats) |
| `no alternative certificate subject name matches` | le nom demandé n'est pas dans le SAN | [cas I](iam-network-troubleshooting.md#i--tls-et-certificats) |
| `Connection refused` | rien n'écoute sur ce port | [cas J](iam-network-troubleshooting.md#j--ports-et-connexions-tcp) |
| Connexion qui reste suspendue puis expire | firewall qui jette les paquets en silence | [cas J](iam-network-troubleshooting.md#j--ports-et-connexions-tcp) |
| `NXDOMAIN` | le nom n'existe pas dans le DNS interrogé | [cas H](iam-network-troubleshooting.md#h--dns) |
| Boucle de redirection sur le login | cookie non déposé, souvent un reverse proxy | [cas K](iam-network-troubleshooting.md#k--reverse-proxy) |
| `unauthorized_client` sur le token endpoint | mauvais `client_secret` | [cas E](iam-network-troubleshooting.md#e--redirect_uri-mismatch) |
| `invalid_client` sur le token endpoint | mauvais `client_id` | [cas E](iam-network-troubleshooting.md#e--redirect_uri-mismatch) |
| 401 après quelques minutes d'inactivité | jeton expiré, renouvellement en échec | [cas G](iam-network-troubleshooting.md#g--expiration-du-jeton) |

### Les deux réflexes qui font gagner le plus de temps

**Distinguer « refusé » de « suspendu ».** Une connexion refusée immédiatement veut dire que la machine a répondu : elle est joignable, mais rien n'écoute sur ce port. Une connexion qui reste suspendue puis expire veut dire que **personne n'a répondu** — un firewall jette les paquets en silence, ou la machine n'existe pas. Deux causes opposées, distinguées par le simple fait d'attendre.

**Situer l'échec avant et après le mot de passe.** Avant, le problème est entre le navigateur et l'IdP. Après, il est entre le serveur applicatif et l'IdP, ou dans la configuration du client. Cette seule question élimine la moitié des hypothèses.
