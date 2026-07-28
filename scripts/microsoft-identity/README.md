# Microsoft Identity — scripts IAM

Module complémentaire du lab. Cinq scripts Python qui inspectent un extrait d'annuaire et signalent ce qui ne devrait pas s'y trouver.

## Pourquoi ce module

Le lab principal montre un accès en train d'être demandé, approuvé et révoqué. Il ne montre pas l'autre moitié du métier : ouvrir un annuaire qui tourne depuis cinq ans et y chercher ce qui a dérivé.

Les cinq scripts posent la même question sous cinq angles : **qui répond de ce droit ?** Un compte sans manager, un groupe sensible sans propriétaire, un compte de service sans owner, une appartenance que personne n'a signée — c'est le même problème à chaque fois. Un droit dont personne n'est responsable est un droit que personne ne retirera jamais.

## Structure

```txt
scripts/microsoft-identity/
  data/                                    extraits d'annuaire mockes
    users.csv
    groups.csv
    group-members.csv
    service-accounts.csv
    access-grants.csv
  output/                                  genere, non versionne
  detect-inactive-accounts.py
  detect-users-without-manager.py
  detect-sensitive-group-members.py
  detect-service-accounts-without-owner.py
  access-review-report.py
  README.md
```

Aucune dépendance : bibliothèque standard Python seulement, version 3.9 ou plus. Les chemins sont résolus depuis l'emplacement du script, donc les commandes marchent depuis la racine du dépôt comme depuis n'importe où.

## Lancer les scripts

Depuis la racine du dépôt :

```bash
python3 scripts/microsoft-identity/detect-inactive-accounts.py
python3 scripts/microsoft-identity/detect-users-without-manager.py
python3 scripts/microsoft-identity/detect-sensitive-group-members.py
python3 scripts/microsoft-identity/detect-service-accounts-without-owner.py
python3 scripts/microsoft-identity/access-review-report.py
```

Chacun affiche un résumé, écrit un CSV dans `output/`, et crée le dossier au besoin.

### La date de référence

Les données mockées sont ancrées au **28 juillet 2026**. Sans précaution, elles vieillissent : dans un an, les quatorze utilisateurs seraient tous inactifs et le module ne démontrerait plus rien.

Tous les scripts acceptent donc `--as-of`, qui vaut aujourd'hui par défaut. Pour reproduire indéfiniment les sorties montrées plus bas :

```bash
python3 scripts/microsoft-identity/detect-inactive-accounts.py --as-of 2026-07-28
```

### Les autres options

```bash
# Changer le seuil d'inactivite
python3 scripts/microsoft-identity/detect-inactive-accounts.py --days 60

# Inclure les comptes invites, exclus par defaut
python3 scripts/microsoft-identity/detect-users-without-manager.py --include-guests

# Ne regarder que les groupes critiques
python3 scripts/microsoft-identity/detect-sensitive-group-members.py --sensitivity critical

# Changer l'anciennete au-dela de laquelle une appartenance est signalee
python3 scripts/microsoft-identity/detect-sensitive-group-members.py --stale-days 180
```

`--help` sur chaque script.

## Les cinq scripts

### 1. `detect-inactive-accounts.py`

Comptes encore activés dont plus personne ne se sert.

Un compte inutilisé n'a que des inconvénients : il élargit la surface d'attaque, il consomme une licence, et personne ne le surveille. Si son mot de passe fuite, il peut servir des mois sans que rien ne détonne, puisqu'il n'y a aucune activité normale à laquelle comparer.

Le script croise l'inactivité avec l'appartenance aux groupes sensibles. C'est ce croisement qui décide de l'urgence : « inactif depuis un an » se traite un jour de pluie, « inactif depuis un an et membre de Finance Admins » se traite le jour même.

```txt
Perimetre     comptes enabled = true uniquement
Seuil         90 jours, --days pour changer
Jamais connecte   compte depuis createdAt, lastLogin sort vide

risk    90-180 j    moyen
       180-365 j    eleve
          > 365 j    critique
                     +1 cran si membre d'un groupe critical ou high
```

Sortie : `output/inactive-accounts.csv`

```txt
email,displayName,department,lastLogin,inactiveDays,risk
laurent.fabre@contoso-lab.com,Laurent Fabre,Finance,2025-06-23,400,critique
david.nguyen@contoso-lab.com,David Nguyen,IT,,200,eleve
external.partner@fabrikam-lab.com,Alex Whitfield,,2026-02-11,167,eleve
pierre.girard@contoso-lab.com,Pierre Girard,Sales,2026-03-30,120,moyen
```

David Nguyen n'a pas de `lastLogin` : le compte a été provisionné et jamais utilisé, ses 200 jours sont comptés depuis sa création. Alex Whitfield est à 167 jours, donc `moyen` sur la seule durée — il ressort en `eleve` parce qu'il est dans External Collaborators.

### 2. `detect-users-without-manager.py`

Comptes actifs que personne n'est en mesure de valider.

Toute la gouvernance repose sur une question : qui répond de cette personne ? C'est le manager qui valide une demande, qui tranche pendant une revue, et qu'on prévient au départ. Sans lui, les droits ne sont jamais remis en cause, faute de quelqu'un à qui poser la question.

Le champ vide n'est que le cas le plus visible. Trois autres situations produisent le même effet, et sont plus fréquentes parce qu'elles apparaissent toutes seules quand un manager s'en va. Un annuaire où tout le monde a un manager renseigné peut être aussi ingouvernable qu'un annuaire où personne n'en a.

```txt
no_manager          managerEmail vide
manager_not_found   l'adresse n'existe pas dans l'annuaire
manager_disabled    le manager existe mais son compte est desactive
manager_is_self     la personne est declaree comme son propre manager
```

Les invités sont exclus par défaut : dans Entra ID, un invité n'a pas de manager mais un *sponsor*, qui joue le même rôle au moment de la revue. `--include-guests` pour les voir.

Sortie : `output/users-without-manager.csv`

```txt
email,displayName,department,issue
amine.kaddour@contoso-lab.com,Amine Kaddour,Operations,manager_disabled
claire.petit@contoso-lab.com,Claire Petit,Executive,manager_is_self
sarah.lemoine@contoso-lab.com,Sarah Lemoine,Legal,manager_not_found
nadia.benali@contoso-lab.com,Nadia Benali,Marketing,no_manager
```

### 3. `detect-sensitive-group-members.py`

Qui se trouve dans les groupes sensibles, et depuis quand.

Dans un annuaire Microsoft, un groupe n'est pas une étiquette, c'est un porte-clés. Être membre de Global Admins, c'est détenir les droits, sans qu'aucune trace ne rappelle pourquoi. Les appartenances s'accumulent au fil des projets et des remplacements, et rien ne les retire tout seul.

```txt
disabled_member     compte desactive, toujours membre du groupe
member_not_found    membre absent de l'extraction des utilisateurs
unknown_assigner    assignedBy vide, personne n'a signe l'attribution
stale_assignment    attribuee il y a plus de 365 jours, jamais reconfirmee
```

Périmètre par défaut : `critical` et `high`. Le niveau `standard` reste hors rapport — y inclure tout le monde reviendrait à ne rien signaler.

Sortie : `output/sensitive-group-members.csv`, triée du plus de constats au moins, groupe le plus sensible d'abord.

```txt
groupName,sensitivity,userEmail,...,enabled,assignedAt,assignedBy,finding
Global Admins,critical,celine.roux@contoso-lab.com,...,false,2023-01-15,,disabled_member;unknown_assigner;stale_assignment
Application Owners,high,gregory.vasseur@contoso-lab.com,...,,2024-05-22,claire.petit@...,member_not_found;stale_assignment
HR Managers,high,celine.roux@contoso-lab.com,...,false,2022-07-25,sophie.bernard@...,disabled_member;stale_assignment
External Collaborators,high,external.partner@fabrikam-lab.com,...,true,2025-10-05,,unknown_assigner
Finance Admins,high,laurent.fabre@contoso-lab.com,...,true,2021-12-01,claire.petit@...,stale_assignment
```

Extrait abrégé : les `...` remplacent les colonnes `displayName` et `department`, et les adresses sont tronquées. Le fichier réel contient les neuf colonnes en entier.

La première ligne est le cas d'école : Céline Roux a quitté la société, son compte a bien été désactivé, mais son appartenance à Global Admins est restée. Elle redeviendra effective le jour où quelqu'un réactivera le compte. Personne n'a signé cette attribution, et elle n'a jamais été revue depuis 2023.

Le script signale aussi les groupes sensibles **sans propriétaire** : sans owner, personne n'est en mesure d'arbitrer la revue.

### 4. `detect-service-accounts-without-owner.py`

Comptes techniques mal tenus.

Un compte de service ne démissionne pas, ne part pas en congé et ne change jamais de mot de passe tout seul. Il survit aux équipes qui l'ont créé. C'est ce qui en fait une cible : très privilégié, jamais surveillé, souvent porteur d'un secret qui n'a pas bougé depuis des années.

```txt
no_owner              ownerEmail vide, ou pointant hors annuaire, ou owner desactive
unused_90d            lastUsed au-dela du seuil, ou jamais utilise
no_rotation           hasRotationPolicy = false
high_privilege        privilegeLevel = high
privileged_no_mfa     privilegeLevel = high et hasMfa = false
unknown_application   compte actif rattache a aucune application connue
```

**Sur le MFA.** Sur un compte de service, le MFA a peu de sens : il n'y a personne pour approuver la notification. Le vrai contrôle est la rotation du secret, ou mieux, une identité gérée par la plateforme — *managed identity* côté Azure, où la plateforme se charge du secret et où il n'y a plus rien à faire tourner. C'est pour ça que `no_rotation` pèse davantage que `privileged_no_mfa` dans une vraie analyse.

L'absence de MFA sur un compte très privilégié reste retenue ici comme un signal, pour une raison indirecte : elle révèle souvent un compte créé à la main dans l'urgence, en dehors des gabarits, et donc exclu des politiques d'accès conditionnel. Le critère ne dit pas « il faut activer le MFA », il dit « ce compte n'est probablement pas passé par le processus normal ».

Un compte désactivé est évalué comme les autres, sauf pour `unknown_application` : un compte désactivé sans application est un vestige, pas une porte ouverte. Mais il garde son secret et reste sans rotation — il devrait être supprimé, pas laissé désactivé.

Sortie : `output/service-accounts-at-risk.csv`, triée par nombre de risques décroissant.

```txt
accountName,application,environment,ownerEmail,lastUsed,privilegeLevel,risks
svc-legacy-import,Legacy Import,prod,gregory.vasseur@...,2024-11-02,high,no_owner;unused_90d;no_rotation;high_privilege;privileged_no_mfa
svc-unknown-01,,prod,,2026-06-30,medium,no_owner;no_rotation;unknown_application
svc-payroll-sync,Payroll Connector,prod,claire.petit@...,2026-07-27,high,high_privilege;privileged_no_mfa
svc-test-fixtures,Test Data Loader,dev,marie.dubois@...,2025-03-14,low,unused_90d;no_rotation
svc-ci-deploy,CI/CD Pipeline,preprod,karim.haddad@...,2026-07-25,high,high_privilege
svc-backup-agent,Backup Agent,prod,,2026-07-26,medium,no_owner
svc-reporting-ro,Finance Reporting,prod,julien.moreau@...,2026-02-20,low,unused_90d
```

Adresses tronquées pour la lisibilité, le fichier réel les contient en entier.

`svc-legacy-import` cumule les cinq : très privilégié, en production, sans rotation, inutilisé depuis près de deux ans, et son propriétaire déclaré n'existe plus dans l'annuaire. C'est le compte qu'on retrouve dans les rapports d'incident.

`svc-ci-deploy` est intéressant à l'inverse : privilégié, donc signalé, mais avec owner, MFA, rotation et usage récent. Le signalement dit « à surveiller », pas « à corriger ».

### 5. `access-review-report.py`

La feuille de travail d'une campagne de revue.

Accorder un accès est facile et se fait vite. Le retirer ne se fait jamais tout seul : personne ne se réveille un matin en se disant qu'il devrait avoir moins de droits. Une organisation qui ne fait que donner accumule, et au bout de quelques années chacun détient les droits de tous les postes qu'il a occupés.

Le script ne décide rien. Chaque ligne sort en `to_review`, commentaire vide. La décision appartient à un humain, et c'est précisément ce qui fait la valeur de l'exercice — un rapport qui pré-remplirait les réponses ne serait plus une revue.

Sortie : `output/access-review.csv`

```txt
userEmail,displayName,department,application,role,grantedAt,grantedBy,businessJustification,reviewDecision,reviewerComment
celine.roux@contoso-lab.com,Celine Roux,HR,Entra ID Admin Center,User Administrator,2023-01-15,,,to_review,
gregory.vasseur@contoso-lab.com,,,Legacy Import,Administrator,2024-11-02,claire.petit@...,Reprise des donnees historiques,to_review,
thomas.leroy@contoso-lab.com,Thomas Leroy,IT,Entra ID Admin Center,Global Administrator,2025-11-14,claire.petit@...,Administration de l'annuaire,to_review,
```

Trois lignes sur seize, adresses tronquées.

Le résumé terminal fait le tri que le CSV ne fait pas :

```txt
  droits orphelins           : 1  identite absente de l'annuaire
  droits sur compte inactif  : 2  compte desactive, droit toujours ouvert
  sans justification metier  : 1  rien a confirmer, la ligne est indefendable
  role d'administration      : 6  a examiner en premier
  detenteur groupe critique  : 6  le droit s'ajoute aux privileges du groupe

  Charge par validateur
    claire.petit@contoso-lab.com               6 ligne(s)
    sophie.bernard@contoso-lab.com             4 ligne(s)
    thomas.leroy@contoso-lab.com               3 ligne(s)
    NON ATTRIBUABLE                            3 ligne(s)
```

Cette dernière ligne est le point qui relie les scripts entre eux : **trois droits n'ont pas de validateur** parce que leurs détenteurs sont ceux du script 2. Une campagne de revue lancée sur un annuaire dont la hiérarchie est cassée produit des lignes que personne ne traitera. C'est pour ça qu'on nettoie les managers avant d'ouvrir une campagne, pas après.

Détail dans [access-review-reporting.md](../../docs/access-review-reporting.md).

## Les données mockées

Quatorze utilisateurs, six groupes, dix-huit appartenances, huit comptes de service, seize droits applicatifs. Le jeu est petit à dessein : on doit pouvoir le lire en entier et vérifier à la main ce que chaque script trouve.

Chaque cas problématique y est placé volontairement :

```txt
users.csv               sans manager, manager desactive, manager inexistant,
                        son propre manager, jamais connecte, inactif 120 j,
                        inactif 400 j, compte desactive, invite externe
groups.csv              un groupe sensible sans proprietaire
group-members.csv       un compte desactive dans deux groupes sensibles,
                        un membre absent de l'annuaire, deux attributions
                        sans signataire, quatre jamais revues
service-accounts.csv    un compte cumulant cinq risques, un compte sain,
                        un compte desactive mais sans rotation
access-grants.csv       un droit orphelin, deux droits sur compte desactive,
                        un droit sans justification metier
```

## Erreurs traitées

Aucun traceback Python. Message en français, code de sortie `1` :

```txt
fichier absent de data/
colonne attendue absente de l'en-tete
fichier ne contenant que son en-tete
--as-of ou --days mal formes
```

Une **date illisible dans les données** est traitée différemment : la ligne est ignorée, un avertissement part sur `stderr`, et le script continue et sort en `0`. Une donnée abîmée sur quatorze lignes ne doit pas faire échouer un rapport qui reste exploitable — mais elle doit se voir.

## Limites

- **Données mockées.** Aucun tenant Entra ID, aucun appel Microsoft Graph. Quatorze utilisateurs là où un annuaire réel en compte des dizaines de milliers, avec des cas que ce jeu ne contient pas.
- **Pas de Graph, mais la logique est transposable.** Chaque script indique en en-tête l'appel qui produirait son fichier d'entrée sur un vrai tenant — `Get-MgUser`, `Get-MgGroupMember`, `Get-MgServicePrincipal`. Passer au réel change la source, pas les règles.
- **Pas d'Active Directory sur site.** AD et Entra ID sont expliqués dans les notes, mais rien n'est testé contre un contrôleur de domaine ni contre LDAP.
- **Seuils arbitraires.** 90 jours et 365 jours sont des conventions courantes, pas une norme. En entreprise ils viennent d'une politique interne, souvent plus stricte sur les comptes à privilèges.
- **Aucune écriture.** Les scripts constatent, ils ne désactivent ni ne suppriment rien. C'est délibéré : un outil de remédiation automatique demande un tout autre niveau de garanties, à commencer par un mode simulation et une trace de ce qu'il a modifié.
- **Pas de boucle de retour sur la revue.** On produit la feuille, on ne réinjecte pas les décisions du réviseur. C'est l'extension la plus naturelle du module.
- **Le dernier sign-in est approximatif.** Sur un vrai tenant, `signInActivity` demande une licence Entra ID P1 et ne remonte que les connexions interactives. Un compte peut être utilisé par un jeton d'application sans que ce champ bouge.
- **Pas de tests automatisés**, cohérent avec le reste du dépôt.

## Lien avec le lab principal

Les deux moitiés se répondent.

Le lab Keycloak montre le **temps réel** : une demande, une approbation, une révocation qui prend effet à la requête suivante. Il répond à « comment un droit apparaît et disparaît ».

Ce module montre l'**inventaire** : ce qu'on trouve dans un annuaire qui tourne depuis des années sans que personne ne regarde. Il répond à « qu'est-ce qui s'est accumulé, et qui en répond ».

Un outil IGA d'entreprise — SailPoint, Saviynt, Entra ID Governance — fait les deux. Le lab implémente le premier, ce module raisonne sur le second.

Notes de fond : [microsoft-identity-notes.md](../../docs/microsoft-identity-notes.md).
