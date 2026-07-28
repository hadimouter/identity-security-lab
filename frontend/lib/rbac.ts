/**
 * Modèle de rôles côté frontend.
 *
 * Sert uniquement à l'affichage : quoi montrer, quoi masquer, quoi
 * annoncer. Le contrôle qui fait autorité est appliqué côté serveur.
 * Voir docs/rbac-model.md.
 */

export type Role = "user" | "manager" | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  user: "Utilisateur",
  manager: "Manager",
  admin: "Administrateur",
};

const USER_CAPABILITIES = [
  "Consulter son profil et ses claims",
  "Demander un accès supplémentaire",
  "Suivre ses demandes et ses accès actifs",
];

const MANAGER_CAPABILITIES = [
  "Consulter les demandes en attente",
  "Approuver ou refuser une demande",
  "Révoquer un accès accordé",
  "Consulter les audit logs",
];

const ADMIN_CAPABILITIES = [
  "Accéder au tableau de bord d'administration",
  "Consulter tous les utilisateurs",
];

/**
 * Droits effectifs par rôle, alignés sur la matrice de docs/rbac-model.md.
 *
 * `manager` couvre aussi les droits `user`, et `admin` ceux de `manager`.
 * Cette portée élargie vient de l'énumération explicite de la matrice, où
 * chaque endpoint liste les rôles qu'il accepte, et non d'un mécanisme
 * d'héritage implicite.
 */
export const ROLE_CAPABILITIES: Record<Role, string[]> = {
  user: USER_CAPABILITIES,
  manager: [...USER_CAPABILITIES, ...MANAGER_CAPABILITIES],
  admin: [...USER_CAPABILITIES, ...MANAGER_CAPABILITIES, ...ADMIN_CAPABILITIES],
};

export type ScreenStatus = "disponible" | "a-venir";

export type Screen = {
  href: string;
  label: string;
  /** Libellé court, pour la barre de navigation. */
  navLabel: string;
  roles: Role[];
  status: ScreenStatus;
  phase?: string;
};

/**
 * Les écrans du lab, y compris ceux qui n'existent pas encore.
 * Les annoncer rend le parcours lisible pendant la construction.
 */
export const SCREENS: Screen[] = [
  {
    href: "/profile",
    label: "Profil et claims",
    navLabel: "Profil",
    roles: ["user", "manager", "admin"],
    status: "disponible",
  },
  {
    href: "/admin",
    label: "Administration",
    navLabel: "Admin",
    roles: ["admin"],
    status: "disponible",
  },
  {
    href: "/request-access",
    label: "Demander un accès",
    navLabel: "Demander",
    roles: ["user", "manager", "admin"],
    status: "disponible",
  },
  {
    href: "/my-requests",
    label: "Mes demandes",
    navLabel: "Mes demandes",
    roles: ["user", "manager", "admin"],
    status: "disponible",
  },
  {
    href: "/my-access",
    label: "Mes accès actifs",
    navLabel: "Mes accès",
    roles: ["user", "manager", "admin"],
    status: "disponible",
  },
  {
    href: "/manager/requests",
    label: "Demandes à valider",
    navLabel: "À valider",
    roles: ["manager", "admin"],
    status: "disponible",
  },
  {
    href: "/manager/grants",
    label: "Accès accordés",
    navLabel: "Accès accordés",
    roles: ["manager", "admin"],
    status: "a-venir",
    phase: "phase 5",
  },
  {
    href: "/manager/audit-logs",
    label: "Audit logs",
    navLabel: "Audit",
    roles: ["manager", "admin"],
    status: "disponible",
  },
];

export function isRole(value: string): value is Role {
  return value === "user" || value === "manager" || value === "admin";
}

export function hasRole(roles: string[], role: Role): boolean {
  return roles.includes(role);
}

/** Écrans visibles pour un jeu de rôles donné. */
export function screensFor(roles: string[]): Screen[] {
  return SCREENS.filter((screen) =>
    screen.roles.some((role) => roles.includes(role)),
  );
}
