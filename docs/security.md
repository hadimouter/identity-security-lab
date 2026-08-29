# Politique de sécurité de la chaîne de build

Ce que la CI vérifie, pourquoi chaque contrôle existe, et ce qu'elle ne vérifie pas.

Le pipeline est dans [.github/workflows/ci.yml](../.github/workflows/ci.yml).

## Le principe

**Un contrôle de sécurité bloque, ou n'existe pas.**

Aucun `|| true`, aucun `continue-on-error` sur un gate. Un scanner dont on ignore le résultat ne protège de rien : il donne le sentiment d'être couvert, ce qui est pire que de savoir qu'on ne l'est pas.

Le corollaire est exigeant : on ne branche un gate qu'après avoir corrigé ce qu'il trouve. Les quatre scanners ont donc été exécutés en local avant d'être ajoutés au pipeline, et les dix vulnérabilités qu'ils remontaient ont été corrigées — pas contournées, et sans baisser un seuil.

## La chaîne

```txt
sast ────────┐
secrets ─────┤
sca ─────────┤
supply-chain ┼──→ sbom
quality ─────┤
scripts ─────┤
integration ─┘
```

Les sept premiers tournent en parallèle. Le SBOM n'est produit que si tous sont verts : un inventaire de composants dont on sait déjà qu'ils sont vulnérables n'a pas d'intérêt.

## Les contrôles

### SAST — Semgrep

Analyse statique du code. Rulesets `p/typescript`, `p/nodejs`, `p/owasp-top-ten`.

L'image est **épinglée** à une version précise, jamais `latest`. Un gate de sécurité doit être déterministe : une nouvelle release de règles ne doit pas repasser le socle au rouge sans qu'on ait rien commité.

Le périmètre est dans [.semgrepignore](../.semgrepignore) : le code écrit ici, pas ce qui est généré ou installé.

**Ce qu'il a trouvé, sur le pipeline lui-même**, en deux passes :

*Quinze tags d'action mutables* — `actions/checkout@v4`, `trufflesecurity/trufflehog@main`. Un tag peut être repointé silencieusement par son propriétaire, ce qui est un vecteur d'attaque de chaîne d'approvisionnement avéré. Toutes les actions sont désormais épinglées par SHA de commit, le tag restant en commentaire pour la lisibilité.

*Pas de période de refroidissement dans Dependabot.* Un paquet compromis — compte de maintainer piraté, publication malveillante — est le plus souvent repéré dans les jours qui suivent sa mise en ligne. Sans délai, Dependabot proposerait la version du jour même. Un `cooldown` de sept jours laisse la communauté faire ce tri.

Les deux trouvailles portent sur des fichiers écrits en même temps que le gate. C'est la meilleure démonstration de son utilité : il a attrapé quelque chose que je venais d'écrire, et que je croyais correct.

### Secrets — Trufflehog

Recherche de secrets sur **tout l'historique git**, pas seulement sur le dernier diff. Un secret retiré dans un commit ultérieur reste lisible dans l'historique, et un dépôt public expose cet historique en entier.

`--only-verified` : ne bloque que sur des identifiants dont la validité a été confirmée auprès du service concerné. Sans cette option, le `.env.example` et le realm export — qui contiennent des valeurs de démonstration ressemblant à des secrets — feraient échouer le pipeline en permanence.

### SCA — npm audit

Vulnérabilités des dépendances, sur les deux projets, qui ont chacun leur lockfile.

Seuil à **`moderate`**, et non `high`. Les deux projets sont à zéro vulnérabilité tous niveaux confondus : un seuil qu'on peut tenir doit être tenu.

### Chaîne d'approvisionnement — Trivy

Scan du système de fichiers : dépendances, secrets en clair, erreurs de configuration.

C'est un **second avis** sur les dépendances. La base de Trivy n'est pas celle de npm et ne remonte pas exactement les mêmes avis ; deux sources valent mieux qu'une sur un sujet où l'absence d'alerte ne prouve rien.

### Qualité — typecheck et lint

Le typecheck du backend couvre `src/` **et** `tests/`, via un `tsconfig.test.json` dédié. Sans lui, les tests ne seraient pas typés — et un test qui ne compile pas est un test qui ne protège pas.

Le frontend passe le lint et un build de production complet.

### Scripts Microsoft Identity

Les cinq scripts d'inspection d'annuaire sont exécutés avec une date de référence figée, puis **le nombre de lignes de chaque rapport est vérifié**. Les données mockées étant ancrées à une date, les sorties sont déterministes : c'est donc un vrai test de non-régression, pas un simple « ça se lance sans planter ».

Un cas d'erreur est également vérifié : une date invalide doit faire sortir le script en échec, proprement, sans traceback Python.

### Tests d'intégration

Les huit tests du backend, contre une vraie infrastructure démarrée par `docker compose up` — et non par des `services:` GitHub, parce que Keycloak doit importer le realm versionné, ce qui suppose de monter un fichier.

Effet de bord utile : la CI exécute exactement ce que le README demande à un humain de lancer. Elle prouve donc à chaque passage qu'un clone neuf, plus `.env.example`, suffit à démarrer le lab.

### SBOM

Inventaire CycloneDX des composants, publié en artefact. Il sert à répondre à « suis-je concerné ? » le jour où une CVE tombe, sans avoir à réinstaller quoi que ce soit ni à deviner ce qui était embarqué à l'époque.

## Les dérogations

Trois règles, dans [.trivyignore.yaml](../.trivyignore.yaml) :

1. Une dérogation cible un **identifiant précis**, jamais un chemin ou une catégorie entière. On accepte un risque nommé, pas une zone d'ombre.
2. Elle porte une **date d'expiration**. Passé ce jour, le gate redevient bloquant. Une exception non datée est une dette oubliée.
3. Elle explique **pourquoi le risque est acceptable ici** : non exploitable, chemin non atteint, correctif inexistant en amont. « Ça bloquait le pipeline » n'est pas une justification.

Le fichier est vide aujourd'hui, et c'est le résultat recherché.

## Comment les dix vulnérabilités ont été traitées

Pour mémoire, parce que la méthode compte autant que le résultat.

**Frontend, six avis.** Next était épinglé à un `16.2.12` exact, ce qui empêchait `npm audit fix` de bouger. Le passage en `16.3.3` — mineur, même majeure — a soldé les chaînes postcss, sharp et nanoid. Vérifié au-delà du build : lint, build de production, et une connexion réelle via Keycloak aboutissant sur `/profile` avec un 403 sur `/admin`, parce qu'un bump de Next touche aux internes dont Auth.js dépend.

**Backend, quatre avis.** Un a été soldé par `npm audit fix`. Les trois autres venaient de `deepmerge-ts` sous `@prisma/config`, et le remède proposé par npm était `prisma@6.12` — une rétrogradation majeure, donc une régression, pas un correctif. L'avis étant corrigé en `deepmerge-ts` 8, un `overrides` npm y épingle la transitive. Vérifié que la CLI Prisma fonctionne toujours dessus : `validate`, `generate`, `migrate status`, `migrate deploy`, plus le typecheck, le build et les huit tests.

## Ce que la CI ne vérifie pas, et pourquoi

**Les CVE des images postgres et keycloak.** Elles en ont, une quarantaine cumulée en HIGH et CRITICAL. Aucune n'est corrigeable ici : ce sont des images tierces, et le seul levier est de changer de version. Un gate qu'on ne peut pas satisfaire finit par être désactivé ou contourné, ce qui abîme la crédibilité de tous les autres.

Le mécanisme retenu est donc le suivi de version par Dependabot, écosystème `docker`, plutôt qu'un gate décoratif. C'est une décision explicite, pas un oubli.

**Le DAST.** Un scan dynamique de type ZAP baseline signalerait immédiatement l'absence de CSP, de HSTS et de TLS. Ce sont des constats justes, et déjà documentés comme limites : le lab tourne en HTTP sans reverse proxy. Les corriger n'a pas de sens sans TLS, et les ignorer demanderait un fichier de règles rempli de dérogations — exactement ce que la politique ci-dessus interdit.

Un DAST deviendra pertinent le jour où le lab tournera derrière un reverse proxy avec un certificat. D'ici là, il produirait du bruit maquillé en couverture.

**Le frontend et les scripts Python ne sont pas testés unitairement.** Seuls le workflow d'accès du backend et ses invariants de concurrence le sont.

**Aucun déploiement.** Le lab tourne en local, il n'y a rien à livrer. Les étapes de signature d'image, d'attestation et de déploiement progressif n'ont pas d'objet ici.

## Ce qui protège le lab lui-même

Distinct de la chaîne de build, et documenté ailleurs :

```txt
docs/architecture.md   frontiere de securite, invariants garantis par la base
docs/rbac-model.md     calcul des droits effectifs
docs/audit-logs.md     tracabilite des actions sensibles
docs/network-iam-notes.md   TLS, DNS, JWKS, ce qui manque en local
```
