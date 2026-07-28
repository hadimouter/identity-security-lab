# Revue d'accès et reporting

Ce que fait une campagne de revue, et comment lire le rapport produit par [access-review-report.py](../scripts/microsoft-identity/access-review-report.py).

## Le problème que la revue résout

Accorder un accès est facile et se fait vite : quelqu'un en a besoin, on le lui donne, on passe à autre chose. Le retirer ne se fait jamais tout seul. Personne ne se réveille un matin en se disant qu'il devrait avoir moins de droits, et aucun manager ne tient la liste des accès de son équipe.

Le résultat est mécanique. Une organisation qui ne fait que donner accumule. Au bout de quelques années, chacun détient les droits de tous les postes qu'il a occupés. On appelle ça l'**accumulation de privilèges**, et c'est ce qui transforme un compte compromis en incident majeur : l'attaquant n'obtient pas les droits d'un poste, il obtient ceux d'une carrière.

La revue d'accès est le seul mécanisme qui inverse la pente. À intervalle régulier, on ressort la liste des droits existants et on demande à un responsable de confirmer, un par un, qu'ils sont toujours nécessaires. Ce qui n'est pas confirmé est retiré.

## Pourquoi on la fait

Trois raisons, dans cet ordre d'honnêteté.

**Parce que c'est obligatoire.** ISO 27001 l'exige au contrôle A.5.18, révision des droits d'accès. SOC 2 la demande. Le RGPD impose la minimisation, dont elle est la mise en œuvre concrète. Pour beaucoup d'organisations, c'est la seule raison, et la campagne est un exercice de conformité.

**Parce que ça réduit vraiment le risque.** Chaque droit retiré est une porte fermée. Un compte compromis dont les droits ont été revus six mois plus tôt cause moins de dégâts.

**Parce que ça révèle l'état réel de l'annuaire.** Une première campagne trouve toujours plus qu'on ne l'imaginait : des comptes de personnes parties, des droits que personne ne sait expliquer, des managers qui ne sont plus là. La campagne échoue en partie, et cet échec est le vrai livrable.

## Qui valide

Le réviseur doit être quelqu'un capable de dire non. C'est plus rare qu'il n'y paraît.

```txt
Le manager             connait le poste, sait si l'acces sert encore
                       le choix par defaut, et le plus solide

Le proprietaire        connait l'application, pas la personne
de l'application       bon pour les droits techniques

L'utilisateur          se valide toujours lui-meme
lui-meme               a reserver aux perimetres a faible enjeu

L'equipe securite      ne connait ni le poste ni l'application
                       ne devrait jamais trancher seule
```

La règle qui prime sur les autres : **personne ne valide ses propres accès.** C'est la séparation des tâches, la même règle que le lab principal applique dans son workflow d'approbation.

Une revue confiée à quelqu'un qui n'ose pas retirer un droit ne sert à rien. C'est pour ça que le manager est le bon réviseur : il assume la conséquence opérationnelle de sa décision. L'équipe sécurité, elle, n'en subit aucune, et approuvera par prudence.

## Ce qu'on vérifie

Pour chaque droit, quatre questions.

**La personne est-elle toujours là ?** Un droit sur un compte parti est le cas le plus simple et le plus fréquent. Il ne devrait pas exister, et il existe toujours.

**Le poste justifie-t-il encore ce droit ?** C'est le cas du *mover* : quelqu'un change de service et conserve les accès de l'ancien. Un comptable passé au marketing qui garde SAP.

**Le niveau est-il le bon ?** Lecture au lieu d'administration. C'est la question qu'on saute le plus souvent, parce qu'elle demande de connaître les rôles de l'application.

**Y a-t-il une justification écrite ?** Sans elle, il n'y a rien à confirmer. Une ligne sans justification métier est indéfendable par construction : le réviseur n'a aucun élément pour trancher, et approuvera par défaut.

## Ce qui rend un accès sensible

```txt
Portee          agit sur tout le tenant, ou sur toute une population
Irreversibilite supprime, transfere de l'argent, modifie une paie
Confidentialite donnees RH, sante, remuneration, juridique
Contournement   permet de s'attribuer d'autres droits
                le plus grave des quatre, et le moins visible
```

La dernière catégorie mérite attention. Un droit qui permet d'ajouter quelqu'un à un groupe est équivalent à tous les droits que ce groupe porte. Le rôle `User Administrator` d'Entra ID en est l'exemple : il ne donne accès à aucune donnée directement, mais il permet de réinitialiser des mots de passe, donc de devenir n'importe qui.

## Le rapport produit par le module

```bash
python3 scripts/microsoft-identity/access-review-report.py
```

Écrit `scripts/microsoft-identity/output/access-review.csv`.

### Les colonnes

```txt
userEmail               qui detient le droit
displayName             vide si l'identite est absente de l'annuaire : droit orphelin
department              sert souvent de perimetre de decoupage de la campagne
application             sur quoi
role                    a quel niveau — la colonne a lire en second
grantedAt               depuis quand — plus c'est ancien, plus c'est suspect
grantedBy               qui a decide — vide, personne n'assume
businessJustification   pourquoi — vide, la ligne est indefendable
reviewDecision          to_review au depart, a remplir
reviewerComment         vide au depart, a remplir
```

### Le rapport ne décide rien

Toutes les lignes sortent en `to_review`, avec un commentaire vide. C'est délibéré.

Un rapport qui pré-remplirait les décisions ne serait plus une revue. Le réviseur validerait en bloc ce qui est déjà proposé, et la campagne produirait exactement le résultat qu'un script a calculé — c'est-à-dire rien de plus que ce qu'on savait déjà. Toute la valeur de l'exercice tient dans le jugement humain qu'il force.

Les décisions attendues :

```txt
approve      le droit reste, il est justifie
revoke       le droit part
need_info    le reviseur ne sait pas, il faut demander
             a compter comme un echec de la campagne, pas comme une decision
```

### Comment le lire

L'ordre de traitement, quand on a mille lignes et deux jours :

1. **Les droits orphelins.** Colonne `displayName` vide. L'identité n'existe pas dans l'annuaire, le droit est ouvert sur personne. Aucune décision à prendre, on retire.
2. **Les droits sur compte désactivé.** Signalés dans le résumé terminal. Même conclusion.
3. **Les rôles d'administration.** `role` contenant *admin* ou *owner*. Portée maximale, examen individuel.
4. **Les lignes sans justification.** `businessJustification` vide. Soit on obtient une justification, soit on retire.
5. **Les attributions anciennes.** `grantedAt` de plus d'un an sans revue.
6. **Le reste**, par service.

### Le résumé terminal

Le CSV est une feuille à remplir. Le résumé fait le tri que le CSV ne fait pas :

```txt
  Points d'attention
    droits orphelins           : 1  identite absente de l'annuaire
    droits sur compte inactif  : 2  compte desactive, droit toujours ouvert
    sans justification metier  : 1  rien a confirmer, la ligne est indefendable
    role d'administration      : 6  a examiner en premier
    detenteur groupe critique  : 6  le droit s'ajoute aux privileges du groupe

    orphelin  gregory.vasseur@contoso-lab.com    Legacy Import / Administrator
    inactif   celine.roux@contoso-lab.com        HR Portal / HR Administrator
    inactif   celine.roux@contoso-lab.com        Entra ID Admin Center / User Administrator
```

Céline Roux est partie. Son compte a été correctement désactivé — le départ a donc été traité. Mais ses deux droits applicatifs sont restés ouverts, dont `User Administrator` sur l'annuaire, celui qui permet de réinitialiser les mots de passe. Le jour où quelqu'un réactive ce compte pour une raison quelconque, tout revient d'un coup.

C'est le scénario exact que la revue existe pour attraper, et il ne se voit ni dans les logs de connexion — le compte est désactivé, il ne se connecte pas — ni dans un inventaire de comptes actifs.

### La charge par validateur

```txt
  Charge par validateur
    claire.petit@contoso-lab.com               6 ligne(s)
    sophie.bernard@contoso-lab.com             4 ligne(s)
    thomas.leroy@contoso-lab.com               3 ligne(s)
    NON ATTRIBUABLE                            3 ligne(s)
```

C'est le chiffre qui décide si la campagne est réaliste. Un manager avec quinze lignes les traitera. Avec quatre cents, il approuvera tout le premier jour, et la campagne produira une preuve de conformité sans aucune valeur de sécurité.

Et **trois lignes n'ont pas de validateur**, parce que leurs détenteurs sont ceux que trouve `detect-users-without-manager.py` : pas de manager, manager désactivé, ou personne déclarée comme son propre manager.

D'où l'ordre des opérations : on nettoie les managers **avant** d'ouvrir une campagne, jamais après. Une revue lancée sur un annuaire dont la hiérarchie est cassée produit des lignes que personne ne traitera, et ces lignes sont statistiquement celles qui portent le plus de risque — un compte sans manager est souvent un compte dont le titulaire est déjà parti.

## Ce qu'il faut faire des décisions

Le module s'arrête à la feuille remplie. Dans une vraie campagne, ce qui suit compte autant :

```txt
Appliquer        retirer effectivement les droits marques revoke
                 une revue sans application ne vaut rien
Tracer           qui a decide quoi, quand, avec quel commentaire
                 c'est la preuve d'audit
Mesurer          taux de reponse, proportion de retraits
                 un taux de retrait nul signale une campagne approuvee en bloc
Recommencer      trimestriel sur les acces critiques, annuel sur le reste
```

Le taux de retrait est l'indicateur le plus parlant. À zéro, la campagne a été validée sans être lue. Une première campagne sur un annuaire jamais revu retire couramment entre dix et trente pour cent des droits.

## Limites de ce module

- **Données mockées.** Seize droits, quatorze utilisateurs. Une vraie campagne en compte des milliers, avec des cas d'ambiguïté que ce jeu ne contient pas.
- **Pas de boucle de retour.** On produit la feuille, on ne réinjecte pas les décisions. Rien ne relit le CSV rempli pour en tirer une liste d'actions.
- **Aucune application.** Les scripts ne retirent aucun droit, ils ne font que constater.
- **Pas de notion de campagne.** Ni date d'ouverture, ni échéance, ni relance, ni suivi du taux de réponse. Le champ `reviewStatus` des données d'entrée suggère qu'une campagne précédente a existé, mais rien ne relie les deux.
- **Le réviseur est déduit du manager.** Une vraie campagne permet de désigner le propriétaire de l'application, un délégué, ou un réviseur de repli quand le manager ne répond pas.
- **Pas de séparation des tâches vérifiée.** Le module ne détecte pas les combinaisons de droits interdites — saisir une facture et l'approuver, par exemple. C'est un sujet à part entière dans les outils IGA.
- **Pas de segmentation par risque.** Toutes les lignes sortent avec le même statut. Une campagne réelle traite les accès critiques plus souvent que le reste.

## Lien avec le lab principal

Le lab Keycloak implémente le moment où un droit est **accordé** : demande justifiée, approbation par un manager qui n'est pas le demandeur, trace d'audit, révocation immédiatement effective.

Ce module traite le moment où un droit est **reconfirmé**, des mois plus tard, par quelqu'un qui n'était peut-être pas là quand il a été accordé.

Les deux ensemble forment le cycle complet. Le premier sans le second accumule. Le second sans le premier constate sans pouvoir corriger la cause.
