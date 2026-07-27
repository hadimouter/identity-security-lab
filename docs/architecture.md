# Architecture cible

## Vue simple

Utilisateur
→ Frontend React / Next.js
→ Keycloak
→ Token OIDC
→ Backend Node.js
→ Contrôle RBAC
→ PostgreSQL
→ Audit logs

## Composants

### Frontend

Interface utilisateur :
- login
- profil utilisateur
- demande d'accès
- page manager
- page admin protégée

### Backend

API applicative :
- vérification du token
- lecture des rôles
- gestion des demandes d'accès
- validation manager
- révocation
- écriture des audit logs

### Keycloak

Identity Provider :
- realm
- clients OIDC
- utilisateurs
- rôles
- tokens
- claims

### PostgreSQL

Stockage :
- users
- roles
- access_requests
- access_grants
- audit_logs

## Objectif IAM

Démontrer un flux complet :

1. authentification
2. autorisation
3. demande d'accès
4. validation
5. attribution
6. révocation
7. traçabilité
