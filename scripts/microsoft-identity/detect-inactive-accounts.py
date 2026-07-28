#!/usr/bin/env python3
"""
Comptes encore actifs dont plus personne ne se sert.

Pourquoi c'est un probleme IAM
------------------------------
Un compte active mais inutilise n'a que des inconvenients. Il elargit la
surface d'attaque, il consomme une licence, et surtout personne ne le
surveille : si son mot de passe fuite, il peut servir pendant des mois
sans que quiconque remarque une activite anormale, puisqu'il n'y a aucune
activite normale a laquelle la comparer.

Le script ne se contente pas de compter les jours. Il croise l'inactivite
avec l'appartenance aux groupes sensibles, parce que c'est ce croisement
qui decide de l'urgence : « inactif depuis un an » se traite un jour de
pluie, « inactif depuis un an et membre de Finance Admins » se traite le
jour meme.

Sur un vrai tenant, les donnees viendraient de :
    Get-MgUser -All -Property SignInActivity,AccountEnabled
    (signInActivity.lastSignInDateTime demande une licence Entra ID P1)

Lancement, depuis la racine du depot :
    python3 scripts/microsoft-identity/detect-inactive-accounts.py
    python3 scripts/microsoft-identity/detect-inactive-accounts.py --days 60
    python3 scripts/microsoft-identity/detect-inactive-accounts.py --as-of 2026-07-28
"""

import argparse
import csv
import sys
from datetime import date, datetime
from pathlib import Path

# Les chemins partent du fichier, pas du repertoire courant : le script
# marche depuis la racine du depot comme depuis n'importe ou ailleurs.
BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
OUTPUT = BASE / "output"

# 90 jours est une convention repandue, pas une norme. En entreprise ce
# seuil vient de la politique interne, et il est souvent plus court pour
# les comptes a privileges.
DEFAULT_THRESHOLD_DAYS = 90

# Un cran de plus si le compte touche a un groupe de ce niveau.
ESCALATING_SENSITIVITIES = {"critical", "high"}

RISK_ORDER = ["moyen", "eleve", "critique"]

OUTPUT_COLUMNS = [
    "email",
    "displayName",
    "department",
    "lastLogin",
    "inactiveDays",
    "risk",
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
        warnings.append(f"date illisible ({value}) pour {context}, ligne ignoree")
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


def sensitive_members(groups, memberships):
    """Emails appartenant a au moins un groupe critical ou high."""
    sensitive_ids = {
        g["id"]
        for g in groups
        if g["sensitivity"].strip().lower() in ESCALATING_SENSITIVITIES
    }
    return {
        m["userEmail"].strip().lower()
        for m in memberships
        if m["groupId"].strip() in sensitive_ids
    }


def base_risk(days):
    if days > 365:
        return "critique"
    if days > 180:
        return "eleve"
    return "moyen"


def escalate(risk):
    """Monte d'un cran, sans depasser le niveau maximum."""
    index = RISK_ORDER.index(risk)
    return RISK_ORDER[min(index + 1, len(RISK_ORDER) - 1)]


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_THRESHOLD_DAYS,
        help=f"seuil d'inactivite en jours (defaut : {DEFAULT_THRESHOLD_DAYS})",
    )
    parser.add_argument(
        "--as-of",
        default=None,
        help="date de reference AAAA-MM-JJ (defaut : aujourd'hui)",
    )
    args = parser.parse_args()

    if args.days < 1:
        fail("--days doit valoir au moins 1")

    if args.as_of:
        try:
            as_of = datetime.strptime(args.as_of, "%Y-%m-%d").date()
        except ValueError:
            fail(f"--as-of attend une date AAAA-MM-JJ, recu : {args.as_of}")
    else:
        as_of = date.today()

    users = read_csv(
        DATA / "users.csv",
        ["email", "displayName", "department", "enabled", "lastLogin", "createdAt"],
    )
    groups = read_csv(DATA / "groups.csv", ["id", "sensitivity"])
    memberships = read_csv(DATA / "group-members.csv", ["groupId", "userEmail"])

    privileged = sensitive_members(groups, memberships)

    warnings = []
    findings = []
    disabled_count = 0
    never_connected = 0

    for user in users:
        # Un compte deja desactive n'est pas le sujet : il ne sert plus,
        # c'est deja acte. On le compte pour ne pas laisser croire qu'il
        # a ete oublie, mais il n'entre pas dans le rapport.
        if user["enabled"].strip().lower() != "true":
            disabled_count += 1
            continue

        email = user["email"].strip()
        last_login = parse_date(user["lastLogin"], email, warnings)

        if last_login is None and user["lastLogin"].strip():
            # Date presente mais illisible : deja signalee, on passe.
            continue

        if last_login is None:
            # Jamais connecte. On compte depuis la creation du compte :
            # un compte provisionne et jamais utilise est un orphelin,
            # souvent le signe d'une arrivee annulee.
            reference = parse_date(user["createdAt"], email, warnings)
            if reference is None:
                continue
            never_connected += 1
        else:
            reference = last_login

        inactive_days = (as_of - reference).days
        if inactive_days <= args.days:
            continue

        risk = base_risk(inactive_days)
        if email.lower() in privileged:
            risk = escalate(risk)

        findings.append(
            {
                "email": email,
                "displayName": user["displayName"].strip(),
                "department": user["department"].strip(),
                "lastLogin": user["lastLogin"].strip(),
                "inactiveDays": inactive_days,
                "risk": risk,
            }
        )

    findings.sort(key=lambda f: f["inactiveDays"], reverse=True)

    out_path = OUTPUT / "inactive-accounts.csv"
    write_csv(out_path, OUTPUT_COLUMNS, findings)

    print(f"Comptes inactifs depuis plus de {args.days} jours")
    print(f"Date de reference : {as_of.isoformat()}")
    print()
    print(f"  comptes examines        : {len(users) - disabled_count} actifs")
    print(f"  comptes desactives      : {disabled_count} (hors perimetre)")
    print(f"  comptes signales        : {len(findings)}")
    print(f"  dont jamais connectes   : {never_connected}")
    print()

    if findings:
        for level in reversed(RISK_ORDER):
            group = [f for f in findings if f["risk"] == level]
            if not group:
                continue
            print(f"  {level} ({len(group)})")
            for f in group:
                jamais = " jamais connecte" if not f["lastLogin"] else ""
                print(f"    {f['email']:<40} {f['inactiveDays']:>4} j{jamais}")
        print()
        print("  Le risque monte d'un cran quand le compte appartient a un")
        print("  groupe sensible : c'est la combinaison qui rend l'affaire urgente.")
    else:
        print("  Aucun compte inactif au-dela du seuil.")

    for warning in warnings:
        print(f"  Attention : {warning}", file=sys.stderr)

    print()
    print(f"Rapport ecrit dans {display_path(out_path)}")


if __name__ == "__main__":
    main()
