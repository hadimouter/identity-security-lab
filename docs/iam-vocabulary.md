# Vocabulaire IAM

## IAM - Identity and Access Management

Gestion des identités et des accès : qui est l'utilisateur, à quoi il a accès, pourquoi, pendant combien de temps, et comment on le prouve.

## IGA - Identity Governance and Administration

Gouvernance des identités : demandes d'accès, validations, revues d'accès, séparation des tâches, conformité.

## PAM - Privileged Access Management

Gestion des accès à privilèges : comptes admin, comptes sensibles, élévation temporaire, sessions surveillées.

## RBAC - Role-Based Access Control

Modèle où les permissions sont attribuées via des rôles.

Exemple :
- user
- manager
- admin

## ABAC - Attribute-Based Access Control

Modèle où les décisions d'accès dépendent d'attributs.

Exemples :
- département
- localisation
- niveau de risque
- type d'appareil
- heure de connexion

## SoD - Separation of Duties

Séparation des tâches : empêcher qu'une même personne cumule des droits permettant de réaliser et de valider une opération sensible.

Exemples :
- créer un fournisseur et valider son paiement
- demander un accès et l'approuver soi-même

## Joiner / Mover / Leaver

Cycle de vie d'un collaborateur :
- Joiner : arrivée
- Mover : changement de poste ou de périmètre
- Leaver : départ

## Access Review

Campagne de revue des accès pour vérifier si les droits accordés sont encore nécessaires.

## Least Privilege

Principe du moindre privilège : donner uniquement les droits nécessaires, pas un droit de plus.

## Compte de service

Compte utilisé par une application, un service ou une automatisation.

## Compte technique

Compte non nominatif utilisé pour des opérations techniques.

## Identité non humaine

Identité utilisée par une machine, une application, un agent IA, une API ou une automatisation.

## Audit trail

Trace des actions importantes : qui a fait quoi, quand, sur quoi, et avec quel résultat.
