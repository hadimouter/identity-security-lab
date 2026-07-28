# Microsoft Identity — notes

Notes de fond sur l'écosystème identité de Microsoft, celui qu'on rencontre dans la quasi-totalité des entreprises françaises. Support du module [scripts/microsoft-identity](../scripts/microsoft-identity/README.md).

## Les trois couches à ne pas confondre

C'est la distinction qui structure tout le reste. Trois questions différentes, trois outils différents, souvent mélangés dans la même phrase.

```txt
Annuaire          Qui existe ?
                  Comptes, groupes, rattachements, attributs.
                  AD, Entra ID.

Authentification  Est-ce bien vous ?
                  Mot de passe, MFA, accès conditionnel, SSO.
                  Entra ID, Keycloak, Okta.

Gouvernance       Devriez-vous encore avoir ce droit ?
                  Demande, approbation, revue, expiration, preuve.
                  Entra ID Governance, SailPoint, Saviynt.
```

Une entreprise peut très bien avoir une authentification irréprochable — MFA partout, accès conditionnel serré — et une gouvernance inexistante. C'est même le cas le plus courant : la porte d'entrée est bien gardée, mais personne ne sait qui détient quelles clés à l'intérieur, ni depuis quand.

Les deux premières couches se voient : un utilisateur qui n'arrive pas à se connecter appelle le support. La troisième ne se voit jamais, jusqu'à l'audit ou l'incident.

## Active Directory

L'annuaire historique, sur site, sorti en 2000. Toujours là dans la plupart des grandes entreprises.

```txt
Foret        le sommet, une frontiere de securite
Domaine      une zone administrative, contoso.local
OU           unite d'organisation, un tiroir de rangement
GPO          strategie de groupe, poussee sur les postes et serveurs
```

Protocoles : **LDAP** pour lire l'annuaire, **Kerberos** pour l'authentification. Ce sont des protocoles de réseau local, conçus quand tout le monde était dans le même bâtiment.

Le point à comprendre : **AD ne fait pas d'OAuth ni d'OIDC.** Il ne sait pas délivrer un jeton à une application web tierce. C'est ce qui l'a rendu insuffisant dès que les applications sont parties dans le cloud.

Les groupes AD sont l'unité d'attribution des droits, et ils se nichent les uns dans les autres. Un utilisateur peut se retrouver dans un groupe privilégié par trois niveaux d'imbrication sans que personne ne l'ait décidé explicitement. C'est le cauchemar classique des audits AD.

## Microsoft Entra ID

L'annuaire cloud, anciennement Azure Active Directory. Renommé en 2023, et le nom Azure AD traîne encore partout dans la documentation et dans les conversations.

Ce n'est **pas AD dans le cloud**. C'est un produit différent :

```txt
                    Active Directory        Entra ID
Emplacement         serveurs sur site       service Microsoft
Protocoles          LDAP, Kerberos          OAuth 2.0, OIDC, SAML
Structure           forets, domaines, OU    plat, un tenant
Application aux     postes et serveurs      applications SaaS et cloud
Strategies          GPO                     acces conditionnel
```

La plupart des entreprises ont les deux, synchronisés par **Entra Connect** : AD reste la source, Entra ID en reçoit une copie. Les comptes existent des deux côtés, avec des identifiants différents et des cycles de vie qui peuvent diverger — un compte désactivé d'un côté et pas de l'autre est une trouvaille d'audit banale.

Le **tenant** est l'instance Entra ID d'une organisation. Un tenant, un annuaire, un jeu d'utilisateurs.

## Utilisateurs

```txt
Member    salarie, compte interne
Guest     invite externe, invite via B2B, son identite reste chez lui
```

L'invité est le cas intéressant. Son compte vit dans son propre tenant ; le vôtre ne détient qu'une référence. Vous ne maîtrisez ni son mot de passe, ni son MFA, ni son départ de sa propre société. C'est pour ça que les invités sont traités à part dans toutes les campagnes de revue, et qu'Entra ID leur associe un **sponsor** plutôt qu'un manager.

Attributs qui comptent pour la gouvernance :

```txt
userPrincipalName    l'identifiant de connexion
mail                 l'adresse, qui peut differer de l'UPN
manager              qui valide et qui revoit
department           qui sert souvent de perimetre de revue
accountEnabled       actif ou desactive
signInActivity       derniere connexion, licence P1 requise
employeeId           le lien vers le SIRH, la ou tout devrait commencer
```

Le champ `manager` est celui qui porte la gouvernance. Un annuaire dont les managers sont faux ne peut pas être revu, quels que soient les outils. C'est l'objet du script `detect-users-without-manager.py`.

## Groupes

```txt
Security          porte des droits, c'est le sujet
Microsoft 365     collaboration, arrive avec une equipe Teams et une boite
Distribution      diffusion de courrier, sans droits
```

Deux modes d'appartenance :

- **Assigned** — on ajoute les membres à la main. Simple, et ça dérive : personne ne retire.
- **Dynamic** — une règle décide, par exemple `department eq "Finance"`. L'appartenance suit l'attribut, donc un changement de poste retire l'accès tout seul. C'est très supérieur, et ça reporte le problème sur la qualité des attributs.

Les groupes sont le principal vecteur d'accumulation de droits. D'où `detect-sensitive-group-members.py`, et d'où la règle qu'un groupe sensible doit avoir un **propriétaire** : sans owner, personne n'est en mesure de dire si une appartenance est encore justifiée.

## MFA

Deuxième facteur. Ce que vous savez, plus ce que vous détenez.

Par robustesse croissante :

```txt
SMS               interceptable, vulnerable au portage de numero
Appel vocal       meme faiblesse
Application       Microsoft Authenticator, correct
Number matching   l'utilisateur recopie un nombre affiche a l'ecran
                  contre le MFA fatigue : noyer quelqu'un de notifications
                  jusqu'a ce qu'il en approuve une par lassitude
FIDO2, passkey    resistant au hameconnage, la cle verifie le domaine
```

Le MFA protège l'authentification, pas l'autorisation. Un compte parfaitement authentifié peut détenir des droits qu'il n'aurait jamais dû obtenir. C'est toute la différence entre les deuxième et troisième couches.

## Accès conditionnel

Le moteur de règles d'Entra ID. Une politique dit : *si* ces conditions, *alors* cette exigence.

```txt
Conditions    utilisateur, groupe, application, plateforme,
              localisation, risque de connexion, etat de l'appareil
Exigences     bloquer, exiger le MFA, exiger un appareil conforme,
              limiter la session
```

Exemple type : « Les membres de Global Admins doivent utiliser le MFA depuis un appareil conforme, quelle que soit leur localisation. »

C'est le point de contrôle central de la sécurité Entra ID. Une politique est aussi le seul endroit où un oubli se paie cash : les comptes créés en dehors des gabarits — souvent des comptes de service — échappent aux politiques ciblées par groupe. C'est pour ça que le script sur les comptes de service retient l'absence de MFA comme signal indirect.

## PIM — Privileged Identity Management

L'accès juste-à-temps aux rôles privilégiés.

Sans PIM, un administrateur détient son rôle en permanence. S'il se fait compromettre à trois heures du matin un dimanche, l'attaquant est administrateur à trois heures du matin un dimanche.

Avec PIM, le rôle est **éligible** et non actif. Pour l'utiliser, il faut l'activer : justification, MFA, parfois approbation d'un pair, et le rôle expire tout seul au bout de quelques heures.

Ce que ça change :

```txt
Surface d'attaque   nulle en dehors des periodes d'activation
Tracabilite         chaque activation est datee et justifiee
Habitude            activer un role devient un acte conscient
```

C'est le concept que le lab principal effleure : les droits d'administration ne sont pas dans le jeton, ils sont accordés en base et retirables à tout instant. La différence est que PIM ajoute l'expiration automatique, ce que le lab ne fait pas.

## Access Reviews

Les campagnes de revue d'accès, dans Entra ID Governance.

On choisit un périmètre — les membres d'un groupe, les détenteurs d'un rôle, les invités —, une périodicité, et un réviseur : le manager, le propriétaire du groupe, ou la personne elle-même. Chaque réviseur reçoit sa liste et tranche ligne par ligne.

Le paramètre qui décide de tout : **que faire des lignes non traitées ?** Les laisser en l'état vide la campagne de son sens — ne rien faire revient à tout approuver. Les retirer automatiquement est plus sévère, plus efficace, et provoque des appels au support. Le bon réglage dépend de la criticité du périmètre.

Détail sur la mécanique et sur le rapport produit par ce module : [access-review-reporting.md](access-review-reporting.md).

## Microsoft Graph API

L'API unique pour tout l'écosystème Microsoft 365 et Entra ID. C'est elle qui alimenterait ce module s'il tournait sur un vrai tenant.

```txt
GET  /v1.0/users
GET  /v1.0/users?$select=displayName,signInActivity,accountEnabled
GET  /v1.0/users/{id}/manager
GET  /v1.0/groups/{id}/members
GET  /v1.0/servicePrincipals
```

Côté PowerShell, le module `Microsoft.Graph` enveloppe les mêmes appels :

```powershell
Get-MgUser -All -Property DisplayName,SignInActivity,AccountEnabled
Get-MgGroupMember -GroupId $id
```

Deux points à connaître. Les **permissions** se déclinent en déléguées, au nom d'un utilisateur connecté, et applicatives, pour un traitement automatique sans humain — et une permission applicative comme `User.Read.All` porte sur tout le tenant, sans filtre. Et **`signInActivity` demande une licence Entra ID P1**, ce qui explique pourquoi tant d'inventaires de comptes dormants s'appuient sur des données incomplètes.

## Lien avec le lab Keycloak

Les deux moitiés se répondent, et savoir les articuler est le vrai sujet.

**Ce que le lab couvre déjà, et qui se transpose directement.** Keycloak et Entra ID sont tous deux des serveurs d'autorisation OAuth 2.0. Le flux Authorization Code + PKCE est le même, les jetons ont la même forme, la validation de signature via JWKS est identique. Un `realm` Keycloak correspond à un `tenant` Entra ID, un client Keycloak à une app registration. Le code d'API du lab fonctionnerait contre Entra ID en changeant l'issuer et l'audience.

**Ce que le lab fait et qu'Entra ID fait mieux.** Le workflow de demande, d'approbation et de révocation existe dans Entra ID Governance sous le nom d'Entitlement Management, avec en plus l'expiration automatique, les campagnes récurrentes et les politiques de séparation des tâches.

**Ce que le lab démontre et qui reste vrai partout.** Les droits effectifs recalculés à chaque requête. Un JWT signé ne se révoque pas avant son expiration — c'est vrai d'Entra ID comme de Keycloak. Entra ID répond par une durée de vie courte et la révocation de session côté serveur ; le lab répond en gardant les droits sensibles en base plutôt que dans le jeton. Ce sont deux réponses valables au même problème, et pouvoir les comparer est plus utile que d'en connaître une seule.

**Ce que le lab ne couvre pas du tout, et que ce module aborde.** L'inventaire. Ce qu'on trouve dans un annuaire qui tourne depuis cinq ans sans que personne ne regarde : les comptes dormants, les hiérarchies cassées, les groupes sensibles jamais revus, les comptes de service dont plus personne ne connaît l'usage.
