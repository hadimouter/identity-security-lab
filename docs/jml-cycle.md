# Cycle Joiner / Mover / Leaver

## Objectif

Comprendre le cycle de vie d'une identité dans une organisation.

## 1. Joiner - Arrivée

Un collaborateur arrive dans l'entreprise.

Actions IAM :
- création de l'identité
- rattachement à un manager
- attribution d'un département
- attribution des droits de base
- accès aux applications nécessaires

Risques :
- droits trop larges dès l'arrivée
- mauvais rattachement organisationnel
- absence de validation manager

## 2. Mover - Changement

Un collaborateur change de poste, d'équipe ou de périmètre.

Actions IAM :
- ajout des nouveaux accès nécessaires
- retrait des anciens accès
- mise à jour des groupes et rôles
- validation par le manager ou owner applicatif

Risques :
- accumulation de droits
- anciens accès non révoqués
- conflit de permissions

## 3. Leaver - Départ

Un collaborateur quitte l'entreprise.

Actions IAM :
- désactivation du compte
- révocation des accès applicatifs
- retrait des groupes
- transfert ou suppression des accès sensibles
- conservation des traces d'audit

Risques :
- compte encore actif après départ
- accès applicatifs oubliés
- tokens ou sessions non révoqués

## Phrase cible

Un collaborateur arrive, reçoit une identité, obtient des droits, change de périmètre, ses droits sont revus, puis il part et ses accès sont retirés. Tout doit être traçable.
