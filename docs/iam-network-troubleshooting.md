# Diagnostic d'un SSO qui ne marche pas

Fiche pratique. Chaque cas suit le même format, pour se lire dans l'urgence.

```txt
Symptome        ce que voit l'utilisateur, ou le message exact
Hypotheses      par ordre de probabilite
Commande        celle qui tranche
Interpretation  ce que dit chaque sortie possible
Correction      quoi changer, et ou
```

Les notions sont dans [network-iam-notes.md](network-iam-notes.md), les schémas dans [iam-network-flows.md](iam-network-flows.md).

## Portée

Les commandes des cas A à G ont été **exécutées contre ce lab**, et les messages reproduits sont les vrais. Les cas H à L utilisent des cibles publiques, puisque le lab n'a ni DNS, ni TLS, ni reverse proxy.

Commandes pour macOS et Linux. Sur Windows, `Test-NetConnection` remplace `nc`, et `Resolve-DnsName` remplace `dig`.

---

## L'outil à mettre en place en premier : décoder un JWT

Plusieurs cas ci-dessous demandent de lire le contenu d'un jeton. À coller une fois dans le terminal :

```bash
jwt() {
  cut -d. -f"${2:-2}" <<< "$1" \
    | jq -R 'gsub("-";"+") | gsub("_";"/") | . + ("=" * ((4 - (length % 4)) % 4)) | @base64d | fromjson'
}
```

Usage :

```bash
jwt "$TOKEN"      # la charge utile : iss, aud, exp, roles…
jwt "$TOKEN" 1    # l'en-tete : alg, typ, kid
```

**Pourquoi pas `base64 -d` directement.** Un JWT est encodé en base64**url**, une variante qui remplace `+` et `/` par `-` et `_`, et qui omet les `=` de rembourrage. Le `base64` de macOS ne connaît pas cette variante : il produit une sortie tronquée, et `jq` échoue sur un JSON incomplet. La fonction ci-dessus rétablit les deux caractères et le rembourrage avant de décoder.

**Décoder n'est pas vérifier.** N'importe qui peut lire le contenu d'un JWT, c'est du base64, pas du chiffrement. La signature seule prouve l'origine, et elle se vérifie avec les clés du JWKS. Ne jamais accorder un droit sur la foi d'un jeton simplement décodé.

---

## L'arbre de décision

À dérouler avant d'ouvrir un cas particulier. Trois questions éliminent la moitié des hypothèses.

```txt
La page de login de l'IdP s'affiche-t-elle ?
│
├── NON  ─────────────────────► le navigateur ne joint pas l'IdP
│                               cas A, H, I, J
│
└── OUI
    │
    L'erreur arrive-t-elle APRES la saisie du mot de passe ?
    │
    ├── OUI ────────────────────► le serveur ne joint pas l'IdP,
    │                             ou la configuration du client est fausse
    │                             cas A, E, K
    │
    └── NON, je suis connecte
        │
        Les appels d'API fonctionnent-ils ?
        │
        ├── NON, tout est en 401 ──► JWKS, issuer, audience, horloge
        │                            cas C, B, F, G, L
        │
        └── NON, certains en 403 ──► ce n'est pas un probleme reseau
                                     c'est du RBAC, l'identite est reconnue
```

**La distinction 401 / 403 est celle qui oriente le mieux.** Un 403 signifie que le jeton a été validé : la chaîne réseau fonctionne de bout en bout, et le problème est dans les droits. Un 401 signifie que la validation a échoué, et là seulement le réseau est suspect.

---

## A — L'IdP est injoignable

### Symptôme

La page de login ne s'affiche pas. Ou, variante plus déroutante, elle s'affiche, l'utilisateur saisit son mot de passe, et **l'erreur arrive après** — signe que c'est le serveur applicatif, et non le navigateur, qui ne joint pas l'IdP.

### Hypothèses

1. le service est arrêté
2. le port n'est pas publié
3. un firewall bloque la sortie du serveur applicatif
4. le nom ne résout pas

### Commandes

```bash
curl -I http://localhost:8080
docker compose ps
docker compose logs keycloak --tail 30
```

### Interprétation

Réponse attendue quand tout va bien :

```txt
HTTP/1.1 302 Found
Location: http://localhost:8080/admin/
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Un **302** est un bon signe : Keycloak répond et redirige vers sa console. Une redirection n'est pas une erreur.

`docker compose ps` doit montrer les deux services, avec leurs ports publiés :

```txt
SERVICE    STATUS                PORTS
keycloak   Up 45 hours           0.0.0.0:8080->8080/tcp
postgres   Up 2 days (healthy)   0.0.0.0:5432->5432/tcp
```

La colonne `PORTS` est celle à regarder. Un conteneur peut être `Up` sans publier son port : le service tourne, et personne ne peut l'atteindre depuis l'hôte.

### Correction

```txt
Service arrete          docker compose up -d
Port non publie         verifier la section ports: du docker-compose.yml
Firewall                autoriser le serveur applicatif vers l'IdP en sortie
Nom qui ne resout pas   cas H
```

---

## B — L'issuer ne correspond pas

### Symptôme

L'API renvoie 401 avec un message évoquant un claim `iss` invalide, alors que le login fonctionne parfaitement.

### Hypothèses

1. l'API attend un issuer différent de celui inscrit dans le jeton
2. le jeton vient d'un autre realm
3. l'IdP a été déplacé derrière un autre nom sans que l'API soit mise à jour

### Commande

```bash
curl -s http://localhost:8080/realms/identity-lab/.well-known/openid-configuration | jq .issuer
```

### Interprétation

```txt
"http://localhost:8080/realms/identity-lab"
```

Cette valeur doit être **strictement identique** à `KEYCLOAK_ISSUER` dans le `.env`. Comparaison caractère par caractère, aucune tolérance :

```txt
http://localhost:8080/...   et   http://127.0.0.1:8080/...      differents
http://localhost:8080/...   et   http://localhost:8080/.../     differents
http://localhost:8080/...   et   https://localhost:8080/...     differents
```

L'API affiche d'ailleurs ce qu'elle attend au démarrage, ce qui permet de comparer sans lire le code :

```txt
[api] resource server sur http://localhost:4000
[api] issuer attendu   : http://localhost:8080/realms/identity-lab
[api] audience attendue: identity-lab-api
```

Le point d'accès de découverte est utile au-delà de l'issuer. Il donne toutes les adresses de l'IdP :

```bash
curl -s http://localhost:8080/realms/identity-lab/.well-known/openid-configuration \
  | jq '{issuer, authorization_endpoint, token_endpoint, jwks_uri, end_session_endpoint}'
```

```json
{
  "issuer": "http://localhost:8080/realms/identity-lab",
  "authorization_endpoint": "http://localhost:8080/realms/identity-lab/protocol/openid-connect/auth",
  "token_endpoint": "http://localhost:8080/realms/identity-lab/protocol/openid-connect/token",
  "jwks_uri": "http://localhost:8080/realms/identity-lab/protocol/openid-connect/certs",
  "end_session_endpoint": "http://localhost:8080/realms/identity-lab/protocol/openid-connect/logout"
}
```

**C'est la première commande à lancer sur n'importe quel IdP OIDC**, y compris Entra ID. Elle prouve d'un coup que le service répond, que le realm existe, et elle donne les adresses exactes à utiliser.

### Correction

Aligner `KEYCLOAK_ISSUER` sur ce que renvoie la découverte, puis redémarrer l'API. Attention : changer l'issuer **invalide tous les jetons déjà émis**.

---

## C — Le JWKS est injoignable

### Symptôme

**Le mode de panne le plus déroutant.** Le login fonctionne, l'utilisateur arrive sur l'application, et chaque appel d'API renvoie 401.

Le symptôme ne ressemble pas à sa cause : le login passe par le navigateur et par le token endpoint, la validation passe par le JWKS. Ce sont deux chemins réseau différents.

### Hypothèses

1. le firewall bloque la sortie de l'API vers l'IdP
2. l'IdP est injoignable depuis le serveur d'API, mais joignable depuis le poste
3. le jeton vient d'un autre émetteur, donc son `kid` est introuvable

### Commande

```bash
curl -s http://localhost:8080/realms/identity-lab/protocol/openid-connect/certs \
  | jq '{nombre: (.keys | length), cles: [.keys[] | {kid, alg, use}]}'
```

### Interprétation

```json
{
  "nombre": 2,
  "cles": [
    { "kid": "3u4BvLF4Op1r8tKRaXyIcbwClHiBa_QBStm6cFvhYR4", "alg": "RSA-OAEP", "use": "enc" },
    { "kid": "6_AoHDyRyr1VqL_IykD0xBA0Ukq9rD2iu0N-rrvwXjE", "alg": "RS256",    "use": "sig" }
  ]
}
```

**Deux clés, et c'est normal.** Une pour le chiffrement (`use: enc`), une pour la signature (`use: sig`). Seule celle marquée `sig` sert à vérifier un jeton. Une bibliothèque correcte ignore l'autre.

Le point à vérifier : le `kid` de l'en-tête du jeton doit figurer dans cette liste.

```bash
jwt "$TOKEN" 1
```

```json
{ "alg": "RS256", "typ": "JWT", "kid": "6_AoHDyRyr1VqL_IykD0xBA0Ukq9rD2iu0N-rrvwXjE" }
```

Et la vérification croisée, qui répond d'un coup :

```bash
KID=$(jwt "$TOKEN" 1 | jq -r .kid)
curl -s http://localhost:8080/realms/identity-lab/protocol/openid-connect/certs \
  | jq -e --arg k "$KID" '.keys[] | select(.kid == $k) | {kid, alg, use}'
```

```json
{ "kid": "6_AoHDyRyr1VqL_IykD0xBA0Ukq9rD2iu0N-rrvwXjE", "alg": "RS256", "use": "sig" }
```

Une sortie vide, et `jq -e` qui renvoie un code d'erreur, signifient que la clé n'est pas là : le jeton vient d'ailleurs.

**La commande doit être lancée depuis la machine qui exécute l'API**, pas depuis votre poste. C'est tout l'intérêt du diagnostic : un JWKS joignable depuis votre poste et injoignable depuis le serveur est exactement le cas qu'on cherche.

### Le cas du jeton venu d'ailleurs

Un jeton émis par un autre realm échoue **ici**, pas sur la vérification de l'issuer, parce que chaque realm a ses propres clés. Message réel du lab, obtenu en présentant un jeton du realm `master` :

```txt
Aucune clé du JWKS ne correspond au kid du jeton.
Il vient probablement d'un autre realm ou d'un autre émetteur.
```

C'est contre-intuitif et c'est logique : la vérification du `kid` vient avant celle de l'issuer dans l'ordre des contrôles.

### Correction

```txt
Firewall            autoriser le serveur d'API vers l'IdP, en sortie, sur 443
Mauvais realm       verifier le realm dans l'URL du JWKS et dans l'issuer
Cache trop long     redemarrer l'API force le retelechargement des cles
```

---

## D — Joindre l'API

### Symptôme

Les pages qui affichent des données montrent une erreur, ou un bandeau signale que seuls les rôles du jeton sont pris en compte.

### Commande

```bash
curl -i http://localhost:4000/health
nc -vz localhost 4000
```

### Interprétation

Quand rien n'écoute, `curl` ne renvoie **aucune sortie** et un code HTTP `000`. C'est déroutant la première fois. La version verbeuse est bien plus parlante — sortie réelle obtenue avec l'API arrêtée :

```txt
$ curl -v http://localhost:4000/health
* IPv6: ::1
* IPv4: 127.0.0.1
*   Trying [::1]:4000...
* connect to ::1 port 4000 from ::1 port 60374 failed: Connection refused
*   Trying 127.0.0.1:4000...
* connect to 127.0.0.1 port 4000 from 127.0.0.1 port 60375 failed: Connection refused
* Failed to connect to localhost port 4000 after 0 ms: Couldn't connect to server
```

À comparer avec un service qui répond :

```txt
$ curl -v http://localhost:8080/realms/identity-lab
* Host localhost:8080 was resolved.
* IPv6: ::1
* IPv4: 127.0.0.1
* Connected to localhost (::1) port 8080
> GET /realms/identity-lab HTTP/1.1
> Host: localhost:8080
< HTTP/1.1 200 OK
```

Deux détails à noter dans la sortie d'échec.

**`curl` essaie IPv6 puis IPv4.** `localhost` résout vers les deux, et il les tente dans l'ordre. Un service qui n'écoute qu'en IPv4 alors que le client tente IPv6 en premier produit un délai, parfois pris pour une lenteur applicative.

**`after 0 ms`.** Le refus est immédiat, ce qui prouve que la machine a répondu. Voir le cas J pour la distinction avec un firewall.

### Correction

```bash
cd backend && npm run dev
```

Vérifier ensuite que l'API annonce bien ce qu'elle attend :

```txt
[api] resource server sur http://localhost:4000
[api] issuer attendu   : http://localhost:8080/realms/identity-lab
[api] audience attendue: identity-lab-api
```

---

## E — redirect_uri mismatch

### Symptôme

Après le clic sur « Se connecter », l'IdP affiche une erreur au lieu du formulaire. Message de Keycloak :

```txt
Invalid parameter: redirect_uri
```

### Hypothèses

1. l'URL de retour envoyée par l'application ne figure pas dans celles déclarées
2. le protocole diffère — `http` contre `https`, souvent à cause d'un reverse proxy
3. le port diffère
4. une barre oblique finale de trop, ou de moins

### Commande

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8080/realms/identity-lab/protocol/openid-connect/auth?client_id=identity-lab-web&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback%2Fkeycloak"
```

### Interprétation

```txt
200   la redirect_uri est acceptee, la page de login s'affiche
400   la redirect_uri est refusee
```

Testé sur le lab, avec une URL non déclarée :

```txt
$ curl -s -o /dev/null -w "%{http_code}\n" "...&redirect_uri=http%3A%2F%2Fevil.example.com%2Fcallback"
400

$ curl -s "...&redirect_uri=http%3A%2F%2Fevil.example.com%2Fcallback" | grep 'instruction'
<p class="instruction">Invalid parameter: redirect_uri</p>
```

**Ce comportement est une protection, pas un défaut.** Sans comparaison stricte, un attaquant pourrait se faire renvoyer le code d'autorisation sur son propre domaine.

Valeur déclarée dans ce lab, à comparer caractère par caractère :

```txt
http://localhost:3000/api/auth/callback/keycloak
```

### Les erreurs voisines du token endpoint

Trois messages différents pour trois causes différentes, tous testés sur le lab :

```txt
mauvais client_secret
{"error":"unauthorized_client","error_description":"Invalid client or Invalid client credentials"}

mauvais client_id
{"error":"invalid_client","error_description":"Invalid client or Invalid client credentials"}

mauvais mot de passe utilisateur
{"error":"invalid_grant","error_description":"Invalid user credentials"}
```

**La distinction à retenir** : `unauthorized_client` et `invalid_client` portent sur l'**application**, `invalid_grant` porte sur l'**utilisateur**. Les descriptions se ressemblent volontairement — un IdP ne dit pas si c'est l'identifiant ou le mot de passe qui est faux, pour ne pas aider à énumérer les comptes.

### Correction

```txt
Cote Keycloak    console > Clients > identity-lab-web > Valid redirect URIs
Cote application AUTH_URL dans le .env, qui sert a construire l'URL de retour
Derriere un proxy  cas K
```

---

## F — Audience invalide

### Symptôme

401 avec un message évoquant un claim `aud` invalide. Le jeton est valide, sa signature est bonne, il vient du bon issuer — mais il n'était pas destiné à cette API.

### La logique

L'audience répond à la question : **pour qui ce jeton a-t-il été émis ?** Sans ce contrôle, un jeton obtenu pour l'application A pourrait servir sur l'API B.

Dans le lab, l'API exige `identity-lab-api`. Le jeton porte :

```txt
aud : ["identity-lab-api", "account"]
azp : identity-lab-web
iss : http://localhost:8080/realms/identity-lab
```

`aud` est un tableau : le contrôle passe si la valeur attendue s'y trouve. `azp` — *authorized party* — indique quel client a demandé le jeton.

### Commande

```bash
jwt "$TOKEN" | jq -c '{iss, aud, azp, exp}'
```

Sortie réelle sur un jeton du lab :

```json
{"iss":"http://localhost:8080/realms/identity-lab","aud":["identity-lab-api","account"],"azp":"identity-lab-web","exp":1785408393}
```

### Le piège Keycloak

Par défaut, Keycloak met `account` dans l'audience, pas le nom de votre API. Vérifier l'audience serait alors décoratif : tous les jetons du realm passeraient.

C'est un **mapper d'audience**, configuré sur le client `identity-lab-web`, qui ajoute `identity-lab-api`. Sans lui, la ligne `audience: env.keycloakAudience` de l'API ne protégerait rien.

### Ce que je n'ai pas pu tester

Produire un vrai jeton avec une mauvaise audience demanderait d'ajouter un second client dans Keycloak, ce que je ne fais pas — le lab est gelé. J'ai vérifié le contrôle par le code et par la valeur réelle de `aud` ci-dessus, pas en provoquant l'échec.

Le contrôle voisin, lui, a été provoqué : un jeton du realm `master` est bien rejeté, mais sur le `kid` avant l'audience. Voir le cas C.

### Correction

```txt
Mapper absent       console > Clients > identity-lab-web > Client scopes
                    > dedicated > Add mapper > Audience
Mauvaise valeur     KEYCLOAK_AUDIENCE dans le .env
```

---

## G — Expiration du jeton

### Symptôme

Tout fonctionne, puis 401 après quelques minutes d'inactivité.

### La commande

```bash
jwt "$TOKEN" | jq '{iat, exp}'
```

Puis comparer à l'heure courante :

```bash
date +%s
```

### Interprétation

Testé sur le lab, avec un jeton conservé plus de cinq minutes :

```txt
exp depasse de 247 s
HTTP 401
{"error":"unauthorized","message":"Le jeton a expiré."}
```

Les trois champs temporels d'un JWT :

```txt
iat   emis a      la date d'emission
exp   expire a    au-dela, le jeton est refuse
nbf   pas avant   rarement utilise, le jeton n'est pas encore valable
```

Durée de vie dans ce lab : **300 secondes**. C'est court volontairement, et c'est ce qui limite les dégâts d'un jeton volé.

### Ce qui devrait empêcher ce symptôme

Le frontend renouvelle automatiquement l'access token **30 secondes avant son expiration**, avec le refresh token conservé côté serveur. Si l'utilisateur voit malgré tout une expiration, trois hypothèses :

```txt
Le renouvellement echoue          session.error = "RefreshTokenError"
                                  redirection vers /auth/session-expired
La session SSO Keycloak a expire  le refresh token n'est plus accepte
                                  reconnexion necessaire
L'horloge du serveur derive       cas L
```

### Les autres messages de rejet du lab

Tous obtenus en direct contre l'API :

```txt
En-tete Authorization absent
{"error":"unauthorized","message":"En-tête Authorization: Bearer <token> attendu."}

Chaine qui n'est pas un JWT
{"error":"unauthorized","message":"Le jeton est mal formé."}

Signature alteree
{"error":"unauthorized","message":"Signature invalide. Le jeton n'a pas été émis par Keycloak."}

Jeton d'un autre realm
{"error":"unauthorized","message":"Aucune clé du JWKS ne correspond au kid du jeton.
 Il vient probablement d'un autre realm ou d'un autre émetteur."}

Jeton expire
{"error":"unauthorized","message":"Le jeton a expiré."}
```

Chaque message désigne une cause distincte. C'est délibéré : un 401 générique obligerait à deviner.

---

## H — DNS

### Symptôme

Rien ne se connecte, et l'erreur mentionne un nom d'hôte plutôt qu'une connexion refusée.

### Commandes

```bash
dig +short login.microsoftonline.com
dig login.microsoftonline.com +noall +answer
nslookup login.microsoftonline.com
```

### Interprétation

Sortie réelle, qui montre une vraie chaîne de délégation :

```txt
$ dig login.microsoftonline.com +noall +answer
login.microsoftonline.com.      13547  IN  CNAME  login.mso.msidentity.com.
login.mso.msidentity.com.       300    IN  CNAME  ak.privatelink.msidentity.com.
ak.privatelink.msidentity.com.  300    IN  CNAME  www.tm.a.prd.aadg.akadns.net.

$ dig +short login.microsoftonline.com
login.mso.msidentity.com.
ak.privatelink.msidentity.com.
www.tm.a.prd.aadg.trafficmanager.net.
40.126.32.134
40.126.32.136
```

Trois alias en cascade, puis plusieurs adresses. Les nombres `13547` et `300` sont les **TTL** en secondes : la durée pendant laquelle la réponse reste en cache. Un TTL de 300 signifie qu'un changement met jusqu'à cinq minutes à se propager.

**La conséquence pratique : ne jamais mettre une adresse IP en dur** dans une règle de firewall visant un IdP cloud. Elles changent.

Quand le nom n'existe pas :

```txt
$ dig idp-qui-nexiste-pas.contoso-lab.invalid
;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN
;; flags: qr rd ra; QUERY: 1, ANSWER: 0
```

`NXDOMAIN` veut dire *non-existent domain* : le DNS a répondu, et sa réponse est « ce nom n'existe pas ». À distinguer d'une absence de réponse, qui indiquerait que le serveur DNS lui-même est injoignable.

### La vérification qui compte

**Lancer `dig` depuis la machine qui a le problème.** Un serveur applicatif peut avoir un DNS interne qui répond différemment du DNS public. Un IdP qui résout depuis votre poste et pas depuis le serveur est un cas classique, et il ne se voit qu'en testant au bon endroit.

Pour interroger un serveur DNS précis :

```bash
dig @8.8.8.8 auth.company.com
```

### À propos de `ping`

`ping` teste ICMP, **pas votre service**. Deux conséquences :

```txt
ping echoue          ne prouve rien, ICMP est tres souvent bloque
ping reussit         ne prouve pas que le service repond
```

C'est l'erreur de débutant la plus fréquente. Pour savoir si un service répond, utiliser `nc` ou `curl` — voir le cas J.

### Dans le lab

Aucun DNS. `localhost` est résolu par `/etc/hosts`, sans requête réseau. Le lab ne connaîtra jamais ce problème.

---

## I — TLS et certificats

**Pas dans ce lab**, qui est entièrement en HTTP avec `sslRequired: none`. Les commandes ci-dessous visent des hôtes publics.

### Symptôme

`curl` ou l'application refuse la connexion avec un message mentionnant le certificat. Le navigateur affiche un avertissement de sécurité.

### Commandes

```bash
curl -v https://auth.company.com
openssl s_client -connect auth.company.com:443 -servername auth.company.com </dev/null
```

L'option `-servername` est indispensable : elle envoie le SNI, qui indique au serveur quel nom on demande. Sans elle, un serveur qui héberge plusieurs sites renvoie le mauvais certificat.

### Interprétation — certificat expiré

Message réel, obtenu contre un site public de test :

```txt
$ curl https://expired.badssl.com/
curl: (60) SSL certificate problem: certificate has expired

$ openssl s_client -connect expired.badssl.com:443 -servername expired.badssl.com </dev/null \
    | openssl x509 -noout -dates
notBefore=Apr  9 00:00:00 2015 GMT
notAfter=Apr 12 23:59:59 2015 GMT
```

`notAfter` dans le passé : le certificat est périmé. C'est la panne la plus banale et la plus évitable — un certificat oublié fait tomber toute l'authentification d'une entreprise du jour au lendemain.

### Interprétation — nom qui ne correspond pas

```txt
$ curl https://wrong.host.badssl.com/
curl: (60) SSL: no alternative certificate subject name matches target host name
```

Le mot **alternative** renvoie au SAN, *Subject Alternative Name*.

### CN et SAN, la démonstration

Le certificat de Microsoft, inspecté en direct :

```txt
$ openssl s_client -connect login.microsoftonline.com:443 \
    -servername login.microsoftonline.com </dev/null | openssl x509 -noout -subject -dates

subject= /C=US/ST=WA/L=Redmond/O=Microsoft Corporation/CN=stamp2.login.microsoftonline.com
notBefore=Jun 12 20:21:24 2026 GMT
notAfter=Dec  9 20:21:24 2026 GMT
```

Le CN vaut `stamp2.login.microsoftonline.com`, alors qu'on a demandé `login.microsoftonline.com`. Et pourtant la vérification passe :

```txt
$ curl -s -o /dev/null -w "%{ssl_verify_result}\n" https://login.microsoftonline.com/
0
```

`0` signifie certificat accepté. La raison est dans le SAN :

```txt
X509v3 Subject Alternative Name:
  DNS:login.microsoftonline.com          ◄── le nom demande est ici
  DNS:login2.microsoftonline.com
  DNS:loginex.microsoftonline.com
  DNS:stamp2.login.microsoftonline.com
  ...
```

**C'est la preuve que le CN ne sert plus.** Les navigateurs et `curl` ne regardent que le SAN. Un certificat dont seul le CN serait correct, sans SAN, serait rejeté partout.

### Vérifier la chaîne

```bash
openssl s_client -connect auth.company.com:443 -servername auth.company.com </dev/null 2>/dev/null \
  | grep -E 'Verify return code|Protocol|Cipher'
```

```txt
    Protocol  : TLSv1.3
    Cipher    : AEAD-AES256-GCM-SHA384
    Verify return code: 0 (ok)
```

Un code différent de `0` désigne le problème. Le plus courant est `21 (unable to verify the first certificate)` : le serveur n'envoie pas les certificats intermédiaires. Le navigateur, qui les met souvent en cache, accepte quand même — d'où le symptôme « ça marche dans mon navigateur mais pas depuis mon serveur ».

### Correction

```txt
Certificat expire       le renouveler, et automatiser le renouvellement
Nom absent du SAN       reemettre avec le bon SAN
Chaine incomplete       configurer le serveur pour envoyer les intermediaires
Horloge du client       cas L, une horloge fausse fait croire a une expiration
```

---

## J — Ports et connexions TCP

### Symptôme

Rien ne répond. Reste à savoir si la machine refuse, ou si personne n'écoute.

### Commandes

```bash
nc -vz localhost 8080
lsof -nP -iTCP -sTCP:LISTEN | grep 8080
```

### Interprétation

Testé sur le lab :

```txt
$ nc -vz localhost 8080
Connection to localhost port 8080 [tcp/http-alt] succeeded!

$ nc -vz localhost 9999
nc: connectx to localhost port 9999 (tcp) failed: Connection refused
```

### La distinction qui fait gagner le plus de temps

```txt
Connection refused, immediat
   la machine a REPONDU, en disant qu'elle n'accepte pas
   -> elle est joignable, mais rien n'ecoute sur ce port
   -> service arrete, ou port different de celui attendu

Connexion suspendue, puis expiration au bout de plusieurs secondes
   PERSONNE n'a repondu
   -> un firewall jette les paquets en silence
   -> ou la machine n'existe pas, ou n'est pas routee
```

**Deux causes opposées, distinguées par le simple fait d'attendre.** Un refus immédiat oriente vers le service ; une attente longue oriente vers le réseau.

### Vérifier ce qui écoute localement

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|4000|8080|5432)'
```

```txt
com.docke  16250  hadimouter  152u  IPv6  TCP *:5432 (LISTEN)
com.docke  16250  hadimouter  179u  IPv6  TCP *:8080 (LISTEN)
```

Cette sortie, prise pendant que l'API était arrêtée, montre bien que **rien n'écoutait sur 4000** — les deux seules lignes viennent de Docker.

Écouter et être joignable sont deux choses différentes : un service peut n'écouter que sur `127.0.0.1` et rester injoignable depuis une autre machine, même sans firewall.

### Correction

```txt
Rien n'ecoute          demarrer le service
Ecoute sur 127.0.0.1   le faire ecouter sur 0.0.0.0, si c'est voulu
Firewall               ouvrir le flux, en precisant source et destination
```

---

## K — Reverse proxy

**Pas dans ce lab.** Le navigateur parle directement à Next.js, sans intermédiaire.

Rappel de vocabulaire : `frontend/proxy.ts` **n'est pas un reverse proxy**, c'est le middleware Next.js, renommé `proxy` par le framework.

### Symptôme

Trois formes du même problème :

```txt
redirect_uri mismatch alors que la configuration semble correcte
Boucle de redirection, le navigateur abandonne
L'utilisateur revient de l'IdP et n'est toujours pas connecte
```

### La cause, presque toujours la même

Le reverse proxy termine le TLS et transmet en HTTP. L'application se croit en HTTP, et fabrique des URL en `http://` alors que l'utilisateur est en `https://`.

### Vérifications

**Ce que l'application croit être son URL publique.** C'est le point de départ. Dans la plupart des frameworks, cette valeur vient d'une variable d'environnement — `AUTH_URL` pour Auth.js — ou est déduite des en-têtes reçus.

**Les en-têtes transmis par le proxy.** Depuis l'application, journaliser :

```txt
Host               doit valoir le nom PUBLIC, pas le nom interne
X-Forwarded-Proto  doit valoir https
X-Forwarded-For    doit contenir l'IP reelle du client
```

**Les cookies, dans le navigateur.** Outils de développement, onglet Application, section Cookies. Vérifier `Domain`, `Secure`, `SameSite`, `Path`.

### Les quatre causes de « cookie non envoyé »

```txt
Domaine incorrect      pose pour un domaine different de celui appele
Secure sans HTTPS      le cookie porte Secure et la page est en HTTP
SameSite=Strict        casse le retour depuis l'IdP, qui est un autre site
Path trop restreint    ne couvre pas l'URL appelee
```

`SameSite=Strict` est le piège contre-intuitif : c'est le réglage qui paraît le plus sûr, et c'est celui qui casse OIDC. La valeur par défaut des navigateurs, `Lax`, laisse passer le cookie sur une redirection GET — ce qui est exactement le retour de l'IdP.

### Correction

```txt
Cote proxy         transmettre Host, X-Forwarded-Proto, X-Forwarded-For
Cote application   la configurer pour faire confiance a ces en-tetes
                   et ne le faire QUE si l'application n'est joignable
                   que par le proxy, sinon un client peut les falsifier
Cote IdP           declarer la redirect_uri publique, en https
```

---

## L — Horloge du serveur

### Symptôme

Un jeton fraîchement émis est refusé comme expiré. Ou, sur un domaine Windows, plus personne ne s'authentifie sans raison apparente.

### Pourquoi

Deux mécanismes majeurs de l'IAM dépendent du temps.

```txt
JWT         iat, exp, nbf sont des dates absolues
            une API dont l'horloge avance rejette des jetons valides
            une API dont l'horloge retarde accepte des jetons perimes

Kerberos    les tickets sont horodates contre le rejeu
            tolerance par defaut : CINQ minutes
            au-dela, plus rien ne s'authentifie
```

Le second est le plus brutal, et le message d'erreur ne parle jamais d'heure. C'est pour ça que NTP est une dépendance critique d'Active Directory, pas un détail d'exploitation.

### Commandes

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ  (epoch %s)'
```

```txt
2026-07-30T10:26:11Z  (epoch 1785407171)
```

Comparer avec le `exp` d'un jeton :

```bash
jwt "$TOKEN" | jq '.exp'
```

Un `exp` inférieur à l'epoch courant signifie que le jeton est expiré — du point de vue de **cette** machine. Si le jeton vient d'être émis et paraît déjà expiré, c'est l'horloge qui est fausse, pas le jeton.

### Le clock skew

Les bibliothèques prévoient une tolérance de quelques secondes, pour absorber les micro-écarts entre machines. Quelques **secondes**, pas quelques minutes. Une dérive de plus d'une minute entre deux serveurs est déjà un incident en attente.

### Correction

```txt
Synchroniser sur NTP, et surveiller la derive
Sur un domaine Windows, la source de temps est le controleur de domaine
Verifier aussi le fuseau : une machine en UTC et une en heure locale
donnent le meme epoch, ce n'est donc pas le fuseau qui casse les jetons
```

Ce dernier point mérite d'être su : les JWT et Kerberos travaillent en temps absolu. Un mauvais fuseau horaire rend les journaux illisibles, mais ne fait pas échouer l'authentification. Seule la dérive de l'horloge réelle la casse.

---

## Les six commandes à retenir

Si vous ne devez en mémoriser que six :

```bash
# 1. L'IdP repond-il, et quelles sont ses adresses ?
curl -s https://auth.company.com/realms/X/.well-known/openid-configuration | jq

# 2. Le service ecoute-t-il sur ce port ?
nc -vz auth.company.com 443

# 3. Le nom resout-il, depuis CETTE machine ?
dig +short auth.company.com

# 4. Le certificat est-il valide ?
curl -v https://auth.company.com 2>&1 | grep -E 'SSL|certificate'

# 5. Que contient ce jeton ?  (fonction jwt definie en haut de ce document)
jwt "$TOKEN" | jq '{iss, aud, exp}'

# 6. Quelle heure est-il vraiment ?
date +%s
```

Dans cet ordre, elles couvrent la quasi-totalité des pannes de SSO.
