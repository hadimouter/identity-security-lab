#!/usr/bin/env python3
"""
Qui se trouve dans les groupes sensibles, et depuis quand.

Pourquoi c'est un probleme IAM
------------------------------
Dans un annuaire Microsoft, un groupe n'est pas une etiquette : c'est un
porte-cles. Etre membre de Global Admins, c'est detenir les droits, sans
qu'aucune trace ne rappelle pourquoi. Les appartenances s'accumulent au
fil des projets et des remplacements, et rien ne les retire jamais toutes
seules.

D'ou la regle : un groupe sensible doit etre revu periodiquement, et
chaque appartenance doit pouvoir etre justifiee par quelqu'un. Le script
liste les membres et signale quatre situations qui ne devraient pas
exister.

Sur un vrai tenant, les donnees viendraient de :
    Get-MgGroup -Filter "..." | Get-MgGroupMember

Lancement, depuis la racine du depot :
    python3 scripts/microsoft-identity/detect-sensitive-group-members.py
    python3 scripts/microsoft-identity/detect-sensitive-group-members.py --sensitivity critical
"""

import argparse
import csv
import sys
from datetime import date, datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
OUTPUT = BASE / "output"

# Ce que le module considere comme sensible par defaut. Le niveau
# standard reste hors rapport : y inclure tout le monde reviendrait a
# ne rien signaler.
DEFAULT_SENSITIVITIES = ["critical", "high"]

# Au-dela, l'appartenance n'a probablement jamais ete reconfirmee : la
# plupart des campagnes de revue tournent une fois par an.
DEFAULT_STALE_DAYS = 365

FINDING_LABELS = {
    "disabled_member": "compte desactive, toujours membre",
    "member_not_found": "membre absent de l'annuaire",
    "unknown_assigner": "personne n'a signe cette attribution",
    "stale_assignment": "attribution jamais revue",
}

OUTPUT_COLUMNS = [
    "groupName",
    "sensitivity",
    "userEmail",
    "displayName",
    "department",
    "enabled",
    "assignedAt",
    "assignedBy",
    "finding",
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


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument(
        "--sensitivity",
        nargs="+",
        default=DEFAULT_SENSITIVITIES,
        help=f"niveaux a inclure (defaut : {' '.join(DEFAULT_SENSITIVITIES)})",
    )
    parser.add_argument(
        "--stale-days",
        type=int,
        default=DEFAULT_STALE_DAYS,
        help=f"anciennete au-dela de laquelle une attribution est signalee (defaut : {DEFAULT_STALE_DAYS})",
    )
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

    wanted = {s.strip().lower() for s in args.sensitivity}

    users = read_csv(
        DATA / "users.csv", ["email", "displayName", "department", "enabled"]
    )
    groups = read_csv(DATA / "groups.csv", ["id", "name", "sensitivity", "ownerEmail"])
    memberships = read_csv(
        DATA / "group-members.csv", ["groupId", "userEmail", "assignedAt", "assignedBy"]
    )

    directory = {u["email"].strip().lower(): u for u in users}
    sensitive = {
        g["id"].strip(): g
        for g in groups
        if g["sensitivity"].strip().lower() in wanted
    }

    if not sensitive:
        fail(f"aucun groupe ne correspond aux niveaux demandes : {', '.join(sorted(wanted))}")

    warnings = []
    rows = []

    for membership in memberships:
        group = sensitive.get(membership["groupId"].strip())
        if group is None:
            continue

        email = membership["userEmail"].strip()
        user = directory.get(email.lower())

        findings = []

        if user is None:
            # Le membre n'existe plus dans l'extraction des utilisateurs.
            # Un droit reste attache a une identite qui n'est plus la.
            findings.append("member_not_found")
            display_name = ""
            department = ""
            enabled = ""
        else:
            display_name = user["displayName"].strip()
            department = user["department"].strip()
            enabled = user["enabled"].strip().lower()
            if enabled != "true":
                # Le cas classique du depart mal traite : le compte a bien
                # ete desactive, mais l'appartenance au groupe est restee.
                # Elle redeviendra effective si le compte est reactive.
                findings.append("disabled_member")

        if not membership["assignedBy"].strip():
            findings.append("unknown_assigner")

        assigned_at = parse_date(
            membership["assignedAt"], f"{email} dans {group['name']}", warnings
        )
        if assigned_at is not None and (as_of - assigned_at).days > args.stale_days:
            findings.append("stale_assignment")

        rows.append(
            {
                "groupName": group["name"].strip(),
                "sensitivity": group["sensitivity"].strip(),
                "userEmail": email,
                "displayName": display_name,
                "department": department,
                "enabled": enabled,
                "assignedAt": membership["assignedAt"].strip(),
                "assignedBy": membership["assignedBy"].strip(),
                "finding": ";".join(findings),
            }
        )

    # Les lignes a traiter d'abord : le plus de constats, sur le groupe
    # le plus sensible.
    severity = {"critical": 0, "high": 1, "standard": 2}
    rows.sort(
        key=lambda r: (
            -len(r["finding"].split(";")) if r["finding"] else 0,
            severity.get(r["sensitivity"].lower(), 9),
            r["groupName"],
            r["userEmail"],
        )
    )

    out_path = OUTPUT / "sensitive-group-members.csv"
    write_csv(out_path, OUTPUT_COLUMNS, rows)

    flagged = [r for r in rows if r["finding"]]
    groups_without_owner = [
        g for g in sensitive.values() if not g["ownerEmail"].strip()
    ]

    print("Membres des groupes sensibles")
    print(f"Date de reference : {as_of.isoformat()}")
    print()
    print(f"  groupes retenus     : {len(sensitive)} ({', '.join(sorted(wanted))})")
    print(f"  appartenances       : {len(rows)}")
    print(f"  a examiner          : {len(flagged)}")
    print()

    for group in sorted(sensitive.values(), key=lambda g: severity.get(g["sensitivity"].lower(), 9)):
        members = [r for r in rows if r["groupName"] == group["name"].strip()]
        owner = group["ownerEmail"].strip() or "AUCUN PROPRIETAIRE"
        print(f"  {group['name']} [{group['sensitivity']}] — {len(members)} membre(s), owner : {owner}")

    print()

    if flagged:
        print("  Constats")
        for code, label in FINDING_LABELS.items():
            group_rows = [r for r in flagged if code in r["finding"].split(";")]
            if not group_rows:
                continue
            print(f"    {code} — {label} ({len(group_rows)})")
            for r in group_rows:
                print(f"      {r['userEmail']:<40} {r['groupName']}")
    else:
        print("  Aucun constat sur les appartenances.")

    if groups_without_owner:
        print()
        print("  Groupes sensibles sans proprietaire :")
        for g in groups_without_owner:
            print(f"    {g['name']}")
        print("  Sans owner, personne n'est en mesure d'arbitrer la revue.")

    for warning in warnings:
        print(f"  Attention : {warning}", file=sys.stderr)

    print()
    print(f"Rapport ecrit dans {display_path(out_path)}")


if __name__ == "__main__":
    main()
