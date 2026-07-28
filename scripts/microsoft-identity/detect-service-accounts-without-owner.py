#!/usr/bin/env python3
"""
Comptes de service a risque : identites non humaines mal tenues.

Pourquoi c'est un probleme IAM
------------------------------
Un compte de service ne demissionne pas, ne part pas en conge et ne
change jamais de mot de passe tout seul. Il survit aux equipes qui l'ont
cree. C'est ce qui en fait une cible : tres privilegie, jamais surveille,
et souvent porteur d'un secret qui n'a pas bouge depuis des annees.

Trois choses doivent exister pour chacun : un proprietaire humain, une
justification metier, et une rotation du secret. Ce script cherche ceux
qui n'ont pas les trois.

Note sur le MFA. Sur un compte de service, le MFA a peu de sens : il n'y
a personne pour approuver la notification. Le vrai controle est la
rotation du secret, ou mieux, une identite geree par la plateforme.
L'absence de MFA sur un compte tres privilegie reste malgre tout retenue
ici comme un signal, parce qu'elle revele souvent un compte cree a la
main dans l'urgence, et exclu des politiques d'acces conditionnel.

Sur un vrai tenant, ces identites se repartissent entre :
    Get-MgServicePrincipal      applications et identites managees
    Get-MgUser                  comptes nominatifs detournes en comptes techniques

Lancement, depuis la racine du depot :
    python3 scripts/microsoft-identity/detect-service-accounts-without-owner.py
    python3 scripts/microsoft-identity/detect-service-accounts-without-owner.py --days 30
"""

import argparse
import csv
import sys
from datetime import date, datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
OUTPUT = BASE / "output"

DEFAULT_UNUSED_DAYS = 90

# Valeurs qui signifient « on ne sait pas a quoi ce compte sert ».
UNKNOWN_APPLICATION_VALUES = {"", "unknown", "inconnu", "n/a", "-"}

RISK_LABELS = {
    "no_owner": "aucun proprietaire, ou proprietaire hors annuaire",
    "unused_90d": "inutilise au-dela du seuil, ou jamais utilise",
    "no_rotation": "aucune politique de rotation du secret",
    "high_privilege": "privileges eleves",
    "privileged_no_mfa": "privileges eleves sans MFA",
    "unknown_application": "compte actif rattache a aucune application connue",
}

OUTPUT_COLUMNS = [
    "accountName",
    "application",
    "environment",
    "ownerEmail",
    "lastUsed",
    "privilegeLevel",
    "risks",
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


def assess(account, directory, as_of, unused_days, warnings):
    """Renvoie la liste des codes de risque d'un compte de service."""
    risks = []

    owner = account["ownerEmail"].strip().lower()
    # Un proprietaire qui n'existe plus dans l'annuaire ne vaut pas mieux
    # qu'une case vide : dans les deux cas, personne ne repond.
    if not owner or owner not in directory:
        risks.append("no_owner")

    last_used = parse_date(account["lastUsed"], account["accountName"], warnings)
    if last_used is None or (as_of - last_used).days > unused_days:
        risks.append("unused_90d")

    if not is_true(account["hasRotationPolicy"]):
        risks.append("no_rotation")

    privileged = account["privilegeLevel"].strip().lower() == "high"
    if privileged:
        risks.append("high_privilege")
        if not is_true(account["hasMfa"]):
            risks.append("privileged_no_mfa")

    application = account["application"].strip().lower()
    # Le critere ne vaut que pour un compte encore actif : un compte
    # desactive sans application est un vestige, pas une porte ouverte.
    if is_true(account["enabled"]) and application in UNKNOWN_APPLICATION_VALUES:
        risks.append("unknown_application")

    return risks


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_UNUSED_DAYS,
        help=f"seuil d'inutilisation en jours (defaut : {DEFAULT_UNUSED_DAYS})",
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

    accounts = read_csv(
        DATA / "service-accounts.csv",
        [
            "accountName",
            "ownerEmail",
            "application",
            "environment",
            "enabled",
            "lastUsed",
            "hasMfa",
            "hasRotationPolicy",
            "privilegeLevel",
        ],
    )
    users = read_csv(DATA / "users.csv", ["email", "enabled"])

    # Seuls les comptes humains encore actifs peuvent porter une
    # responsabilite. Un owner desactive, c'est un owner absent.
    directory = {
        u["email"].strip().lower() for u in users if is_true(u["enabled"])
    }

    warnings = []
    rows = []
    healthy = 0

    for account in accounts:
        risks = assess(account, directory, as_of, args.days, warnings)
        if not risks:
            healthy += 1
            continue

        rows.append(
            {
                "accountName": account["accountName"].strip(),
                "application": account["application"].strip(),
                "environment": account["environment"].strip(),
                "ownerEmail": account["ownerEmail"].strip(),
                "lastUsed": account["lastUsed"].strip(),
                "privilegeLevel": account["privilegeLevel"].strip(),
                "risks": ";".join(risks),
            }
        )

    privilege_order = {"high": 0, "medium": 1, "low": 2}
    rows.sort(
        key=lambda r: (
            -len(r["risks"].split(";")),
            privilege_order.get(r["privilegeLevel"].lower(), 9),
            r["accountName"],
        )
    )

    out_path = OUTPUT / "service-accounts-at-risk.csv"
    write_csv(out_path, OUTPUT_COLUMNS, rows)

    print("Comptes de service a risque")
    print(f"Date de reference : {as_of.isoformat()}")
    print()
    print(f"  comptes examines : {len(accounts)}")
    print(f"  comptes signales : {len(rows)}")
    print(f"  sans constat     : {healthy}")
    print()

    if rows:
        print("  Par gravite, du plus expose au moins expose")
        for r in rows:
            count = len(r["risks"].split(";"))
            app = r["application"] or "application inconnue"
            print(f"    {r['accountName']:<22} {r['environment']:<8} {app:<22} {count} risque(s)")
            print(f"      {r['risks']}")
        print()

        print("  Repartition des risques")
        for code, label in RISK_LABELS.items():
            hits = [r for r in rows if code in r["risks"].split(";")]
            if hits:
                print(f"    {code:<22} {len(hits):>2}  {label}")
    else:
        print("  Aucun compte de service en anomalie.")

    for warning in warnings:
        print(f"  Attention : {warning}", file=sys.stderr)

    print()
    print(f"Rapport ecrit dans {display_path(out_path)}")


if __name__ == "__main__":
    main()
