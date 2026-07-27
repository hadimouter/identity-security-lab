# Identity Security Lab

## Objectif

Construire un mini lab IAM pour comprendre et démontrer les mécanismes clés de l'Identity & Access Management :

- SSO avec OpenID Connect
- Gestion des rôles avec RBAC
- Workflow de demande d'accès
- Validation manager
- Révocation d'accès
- Audit logs
- Documentation des flux IAM

## Stack cible

- Frontend : React ou Next.js
- Backend : Node.js / Express
- Identity Provider : Keycloak
- Database : PostgreSQL
- Infra locale : Docker / Docker Compose

## Fonctionnalités prévues

- Authentification via Keycloak
- Rôles : user, manager, admin
- Route protégée `/admin`
- Demande d'accès avec justification
- Validation ou refus par un manager
- Attribution et révocation des accès
- Journalisation des actions sensibles

## Pourquoi ce lab ?

L'objectif est de relier les concepts IAM à une implémentation concrète :

- un utilisateur s'authentifie
- il reçoit des droits
- ses droits peuvent évoluer
- ses accès doivent être revus
- les actions sensibles doivent être traçables
