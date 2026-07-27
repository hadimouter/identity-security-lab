# Scénario complet de demande d'accès

## Acteurs

- User : utilisateur standard
- Manager : valide ou refuse les demandes
- Admin : possède les droits d'administration
- System : journalise les actions

## Scénario

1. Hadi se connecte via Keycloak.
2. Il possède uniquement le rôle `user`.
3. Il accède à la page "Demander un accès".
4. Il demande le rôle `admin`.
5. Il ajoute une justification.
6. La demande passe au statut `pending`.
7. Le manager consulte les demandes en attente.
8. Le manager approuve la demande.
9. Le rôle `admin` est accordé.
10. Une entrée est ajoutée dans les audit logs.
11. Hadi peut accéder à la route `/admin`.
12. Le manager ou admin peut révoquer l'accès.
13. La révocation est journalisée.

## Statuts

- pending
- approved
- rejected
- revoked

## Audit logs à créer

- access_request_created
- access_request_approved
- access_request_rejected
- access_grant_created
- access_grant_revoked
