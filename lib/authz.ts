export const USER_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGER", "USER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "DISABLED", "LOCKED", "PENDING"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"];

export function isAdminRole(role: UserRole) {
  return ADMIN_ROLES.includes(role);
}
