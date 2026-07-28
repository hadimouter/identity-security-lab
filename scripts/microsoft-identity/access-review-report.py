#!/usr/bin/env python3
"""
Feuille de campagne de revue d'acces.

Pourquoi c'est un probleme IAM
------------------------------
Accorder un acces est facile et se fait vite. Le retirer ne se fait
jamais tout seul : personne ne se reveille un matin en se disant qu'il
devrait avoir moins de droits. Une organisation qui ne fait que donner
accumule, et au bout de quelques annees chacun detient les droits de
tous les postes qu'il a occupes.

La revue d'acces est le mecanisme qui inverse cette pente. A intervalle
regulier, on ressort la liste des droits existants et on demande a un
responsable de confirmer, un par un, qu'ils sont toujours necessaires.
Ce qui n'est pas confirme est retire.

Ce script produit la feuille de travail de cette campagne. Il ne decide
rien : chaque ligne sort en `to_review`, avec un commentaire vide. La
decision appartient a un humain, et c'est precisement ce qui fait la
valeur de l'exercice. Un rapport qui pre-remplirait les reponses ne
serait plus une revue.

Sur un vrai tenant, cette mecanique existe deja :
    Entra ID Governance > Identity Governance > Access Reviews

Lancement, depuis la racine du depot :
    python3 scripts/microsoft-identity/access-review-report.py
"""

import argparse
import csv
import sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
OUTPUT = BASE / "output"

# Etat de depart de chaque ligne. C'est au reviseur de trancher.
DEFAULT_DECISION = "to_review"

OUTPUT_COLUMNS = [
    "userEmail",
    "displayName",
    "department",
    "application",
    "role",
    "grantedAt",
    "grantedBy",
    "businessJustification",
    "reviewDecision",
    "reviewerComment",
]


def fail(message):
    """Arrete le script sur un message lisible, sans traceback."""
    print(f"Erreur : {message}", file=sys.stderr)
    sys.exit(1)


def read_csv(path, required_columns):
    """Lit un CSV et verifie que les colonnes attendues sont presentes."""
    if not path.exists():
        fail(f"fichier introuvable : {path}")

    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            fail(f"fichier vide : {path}")

        missing = [c for c in required_columns if c not in reader.fieldnames]
        if missing:
            fail(f"colonnes absentes de {path.name} : {', '.join(missing)}")

        rows = list(reader)

    if not rows:
        fail(f"aucune donnee dans {path.name}, seulement l'en-tete")
    return rows


def parse_date(value, context, warnings):
    """Convertit une date ISO. Une date illisible est signalee, pas fatale."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        warnings.append(f"date illisible ({value}) pour {context}")
        return None


def write_csv(path, columns, rows):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def display_path(path):
    """Chemin relatif au repertoire courant quand c'est possible."""
    try:
        return path.relative_to(Path.cwd())
    except ValueError:
        return path


def is_true(value):
    return (value or "").strip().lower() == "true"


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument(
        "--as-of",
        default=None,
        help="date de reference AAAA-MM-JJ (defaut : aujourd'hui)",
    )
    args = parser.parse_args()

    if args.as_of:
        try:
            as_of = datetime.strptime(args.as_of, "%Y-%m-%d").date()
        except ValueError:
            fail(f"--as-of attend une date AAAA-MM-JJ, recu : {args.as_of}")
    else:
        as_of = date.today()

    users = read_csv(
        DATA / "users.csv",
        ["email", "displayName", "department", "managerEmail", "enabled"],
    )
    groups = read_csv(DATA / "groups.csv", ["id", "name", "sensitivity"])
    memberships = read_csv(DATA / "group-members.csv", ["groupId", "userEmail"])
    grants = read_csv(
        DATA / "access-grants.csv",
        [
            "userEmail",
            "application",
            "role",
            "grantedAt",
            "grantedBy",
            "businessJustification",
            "reviewStatus",
        ],
    )

    directory = {u["email"].strip().lower(): u for u in users}

    # Un droit detenu par quelqu'un qui est deja dans un groupe critique
    # se cumule avec des privileges qu'il detient deja par ailleurs.
    # Volontairement limite a `critical` : elargir a `high` reviendrait a
    # marquer presque tout le monde, et un signal qui designe tout le
    # monde ne designe personne.
    critical_ids = {
        g["id"].strip()
        for g in groups
        if g["sensitivity"].strip().lower() == "critical"
    }
    in_critical_group = {
        m["userEmail"].strip().lower()
        for m in memberships
        if m["groupId"].strip() in critical_ids
    }

    warnings = []
    rows = []
    orphan_grants = []
    disabled_grants = []
    missing_justification = []
    previous_status = Counter()
    workload = Counter()
    unassignable = 0

    for grant in grants:
        email = grant["userEmail"].strip()
        user = directory.get(email.lower())

        previous_status[grant["reviewStatus"].strip() or "vide"] += 1
        parse_date(grant["grantedAt"], f"{email} / {grant['application']}", warnings)

        if user is None:
            # Un droit encore ouvert sur une identite absente de
            # l'annuaire. C'est exactement ce que la revue existe pour
            # attraper : il n'apparaitra dans aucun depart traite.
            orphan_grants.append(grant)
            display_name = ""
            department = ""
            manager = ""
        else:
            display_name = user["displayName"].strip()
            department = user["department"].strip()
            manager = user["managerEmail"].strip()
            if not is_true(user["enabled"]):
                disabled_grants.append(grant)

        if not grant["businessJustification"].strip():
            missing_justification.append(grant)

        # Le validateur est le manager. Sans manager, la ligne ne peut
        # etre attribuee a personne : le rapport du script 2 conditionne
        # donc directement la faisabilite de la campagne.
        if manager and manager.lower() != email.lower():
            workload[manager] += 1
        else:
            unassignable += 1

        rows.append(
            {
                "userEmail": email,
                "displayName": display_name,
                "department": department,
                "application": grant["application"].strip(),
                "role": grant["role"].strip(),
                "grantedAt": grant["grantedAt"].strip(),
                "grantedBy": grant["grantedBy"].strip(),
                "businessJustification": grant["businessJustification"].strip(),
                "reviewDecision": DEFAULT_DECISION,
                "reviewerComment": "",
            }
        )

    rows.sort(key=lambda r: (r["userEmail"], r["application"], r["role"]))

    out_path = OUTPUT / "access-review.csv"
    write_csv(out_path, OUTPUT_COLUMNS, rows)

    cumulative = [r for r in rows if r["userEmail"].lower() in in_critical_group]
    # Un role d'administration se juge sur son intitule, independamment
    # des groupes : c'est le premier tri que fait un reviseur presse.
    administrative = [
        r
        for r in rows
        if any(word in r["role"].lower() for word in ("admin", "owner"))
    ]

    print("Campagne de revue d'acces")
    print(f"Date de reference : {as_of.isoformat()}")
    print()
    print(f"  droits a revoir              : {len(rows)}")
    print(f"  identites concernees         : {len({r['userEmail'] for r in rows})}")
    print(f"  applications concernees      : {len({r['application'] for r in rows})}")
    print()

    print("  Etat lors de la campagne precedente")
    for status, count in previous_status.most_common():
        print(f"    {status:<14} {count:>3}")
    print()

    print("  Points d'attention")
    print(f"    droits orphelins           : {len(orphan_grants)}  identite absente de l'annuaire")
    print(f"    droits sur compte inactif  : {len(disabled_grants)}  compte desactive, droit toujours ouvert")
    print(f"    sans justification metier  : {len(missing_justification)}  rien a confirmer, la ligne est indefendable")
    print(f"    role d'administration      : {len(administrative)}  a examiner en premier")
    print(f"    detenteur groupe critique  : {len(cumulative)}  le droit s'ajoute aux privileges du groupe")
    print()

    for grant in orphan_grants:
        print(f"    orphelin  {grant['userEmail']:<40} {grant['application']} / {grant['role']}")
    for grant in disabled_grants:
        print(f"    inactif   {grant['userEmail']:<40} {grant['application']} / {grant['role']}")
    if orphan_grants or disabled_grants:
        print()

    print("  Charge par validateur")
    for manager, count in workload.most_common():
        print(f"    {manager:<40} {count:>3} ligne(s)")
    if unassignable:
        print(f"    {'NON ATTRIBUABLE':<40} {unassignable:>3} ligne(s)")
        print("    Sans manager valide, ces lignes n'ont pas de reviseur.")
        print("    Lancer detect-users-without-manager.py avant la campagne.")
    print()

    print(f"  Toutes les lignes sortent en '{DEFAULT_DECISION}', commentaire vide.")
    print("  C'est au validateur de trancher : approve, revoke, ou besoin d'information.")

    for warning in warnings:
        print(f"  Attention : {warning}", file=sys.stderr)

    print()
    print(f"Rapport ecrit dans {display_path(out_path)}")


if __name__ == "__main__":
    main()
