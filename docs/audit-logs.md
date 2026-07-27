# Audit logs

Document de cadrage. Il sera complété pendant la phase 4, quand les événements seront réellement écrits par l'API.

## Objectif

Pouvoir répondre, après coup, à quatre questions sur toute action sensible :

- qui a fait l'action
- quelle action
- sur quoi
- quand, et avec quel résultat

C'est la brique qui rend le lab auditable. Sans elle, un accès accordé n'a pas d'histoire et rien ne prouve qu'il a été justifié et validé.

## Format d'un audit log

```txt
id           identifiant
actor_id     auteur de l'action, null si action systeme
action       nom de l'evenement
target_type  type d'objet vise (access_request, access_grant, user)
target_id    identifiant de l'objet vise
result       success ou denied
metadata     contexte libre en JSON
created_at   horodatage
```

L'acteur est nullable : certaines actions n'ont pas d'auteur identifié, par exemple une tentative d'accès avec un jeton invalide.

## Événements requis

```txt
access_request_created
access_request_approved
access_request_rejected
access_grant_created
access_grant_revoked
unauthorized_access_attempt
```

## Événements optionnels

```txt
user_logged_in
user_logged_out
admin_page_accessed
role_checked
```

## Principes retenus

- Un log est écrit pour toute action qui modifie des droits, ainsi que pour tout refus d'accès.
- Les refus sont journalisés au même titre que les succès. Un journal qui ne contient que des succès ne sert à rien en cas d'incident.
- Le champ `metadata` conserve le contexte utile : rôle demandé, justification, commentaire de revue.
- Aucun jeton, mot de passe ou secret ne doit se retrouver dans un audit log.
- Les logs ne sont ni modifiables ni supprimables depuis l'application.
- La consultation est réservée aux rôles `manager` et `admin`.

## À compléter en phase 4

- table `audit_logs` dans le schéma Prisma
- helper d'écriture appelé par les handlers de l'API
- correspondance exacte entre chaque endpoint et l'événement écrit
- page de consultation et filtres
- exemples de journaux produits par le scénario de démonstration
