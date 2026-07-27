#!/usr/bin/env bash
#
# Exporte le realm identity-lab vers keycloak/realm-export.json.
#
# A relancer apres toute modification du realm dans la console Keycloak,
# pour que la configuration reste reproductible depuis le depot.
#
#   ./scripts/export-realm.sh
#
# L'export complet embarque les secrets des clients, y compris ceux des
# clients internes de Keycloak (broker, realm-management), regeneres a
# chaque creation de realm. Ce script les remplace par une valeur de
# demonstration explicite : aucun credential genere ne doit etre versionne.
#
# Les mots de passe des utilisateurs sont exportes sous forme de hachages,
# jamais en clair.

set -euo pipefail

REALM="identity-lab"
OUT="keycloak/realm-export.json"
PLACEHOLDER="local-demo-internal-secret-unused"

cd "$(dirname "$0")/.."

if ! docker compose ps --status running --services | grep -q '^keycloak$'; then
  echo "Erreur : le conteneur keycloak ne tourne pas. Lancer 'docker compose up -d'." >&2
  exit 1
fi

echo "Export du realm ${REALM}..."
docker compose exec -T keycloak /opt/keycloak/bin/kc.sh export \
  --dir /tmp/kcexport --realm "${REALM}" --users realm_file >/dev/null 2>&1

RAW="$(mktemp)"
trap 'rm -f "${RAW}"' EXIT

docker compose cp "keycloak:/tmp/kcexport/${REALM}-realm.json" "${RAW}" >/dev/null
docker compose exec -T keycloak rm -rf /tmp/kcexport

# Les secrets de demonstration font moins de 40 caracteres, les secrets
# generes par Keycloak en font 86. Le seuil suffit a les distinguer.
jq --arg p "${PLACEHOLDER}" '
  .clients |= map(
    if (.secret != null and (.secret | length) > 40)
    then .secret = $p
    else .
    end
  )' "${RAW}" > "${OUT}"

echo "Ecrit dans ${OUT}"
echo
echo "Secrets presents dans l'export :"
jq -r '.clients[] | select(.secret != null) | "  \(.clientId) : \(.secret)"' "${OUT}"
