#!/usr/bin/env python3
"""
Comptes actifs que personne n'est en mesure de valider.

Pourquoi c'est un probleme IAM
------------------------------
Toute la gouvernance des acces repose sur une question simple : qui
repond de cette personne ? C'est le manager qui valide une demande, qui
tranche pendant une revue d'acces, et que l'on previent au depart. Sans
lui, un compte derive : ses droits ne sont jamais remis en cause, faute
de quelqu'un a qui poser la question.

Le champ vide n'est que le cas le plus visible. Trois autres situations
produisent exactement le meme effet, et sont bien plus frequentes parce
qu'elles apparaissent toutes seules quand un manager quitte la societe.
Un annuaire ou tout le monde a un manager renseigne peut donc etre tout
aussi ingouvernable qu'un annuaire ou personne n'en a.

Sur un vrai tenant, les donnees viendraient de :
    Get-MgUser -All -ExpandProperty Manager

Lancement, depuis la racine du depot :
    python3 scripts/microsoft-identity/detect-users-without-manager.py
"""

import argparse
import csv
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
OUTPUT = BASE / "output"

# Les quatre facons de se retrouver sans personne pour valider ses acces.
ISSUE_LABELS = {
    "no_manager": "aucun manager renseigne",
    "manager_not_found": "manager inconnu de l'annuaire",
    "manager_disabled": "manager desactive",
    "manager_is_self": "declare comme son propre manager",
}

OUTPUT_COLUMNS = ["email", "displayName", "department", "issue"]


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


def diagnose(user, directory):
    """Renvoie le code du probleme, ou None si la chaine hierarchique tient."""
    email = user["email"].strip().lower()
    manager = user["managerEmail"].strip().lower()

    if not manager:
        return "no_manager"
    if manager == email:
        return "manager_is_self"
    if manager not in directory:
        return "manager_not_found"
    if directory[manager]["enabled"].strip().lower() != "true":
        return "manager_disabled"
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument(
        "--include-guests",
        action="store_true",
        help="inclure les comptes invites, exclus par defaut",
    )
    args = parser.parse_args()

    users = read_csv(
        DATA / "users.csv",
        ["email", "displayName", "department", "managerEmail", "enabled", "userType"],
    )

    directory = {u["email"].strip().lower(): u for u in users}

    findings = []
    disabled_count = 0
    guest_count = 0

    for user in users:
        # Un compte desactive n'a plus d'acces a gouverner.
        if user["enabled"].strip().lower() != "true":
            disabled_count += 1
            continue

        is_guest = user["userType"].strip().lower() == "guest"

        issue = diagnose(user, directory)
        if issue is None:
            continue

        if is_guest:
            guest_count += 1
            if not args.include_guests:
                continue

        findings.append(
            {
                "email": user["email"].strip(),
                "displayName": user["displayName"].strip(),
                "department": user["department"].strip(),
                "issue": issue,
            }
        )

    findings.sort(key=lambda f: (f["issue"], f["email"]))

    out_path = OUTPUT / "users-without-manager.csv"
    write_csv(out_path, OUTPUT_COLUMNS, findings)

    print("Comptes actifs sans responsable identifiable")
    print()
    print(f"  comptes examines   : {len(users) - disabled_count} actifs")
    print(f"  comptes desactives : {disabled_count} (hors perimetre)")
    print(f"  comptes signales   : {len(findings)}")
    print()

    if findings:
        for code, label in ISSUE_LABELS.items():
            group = [f for f in findings if f["issue"] == code]
            if not group:
                continue
            print(f"  {code} — {label} ({len(group)})")
            for f in group:
                service = f["department"] or "service non renseigne"
                print(f"    {f['email']:<40} {service}")
        print()
    else:
        print("  Chaque compte actif a un manager valide.")
        print()

    if guest_count and not args.include_guests:
        print(f"  {guest_count} compte(s) invite(s) exclu(s) : --include-guests pour les voir.")
        print("  Dans Entra ID, un invite n'a pas de manager mais un sponsor,")
        print("  qui joue le meme role au moment de la revue.")
        print()

    print(f"Rapport ecrit dans {display_path(out_path)}")


if __name__ == "__main__":
    main()
