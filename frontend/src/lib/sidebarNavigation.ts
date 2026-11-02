import { visibleModuleLinks, visiblePrimaryNavigation, type ModuleKey, type NavConfigItem, type PrimaryNavGroup } from "./navigation";

/** Every navigation surface uses current business features and employee access. */
export function sidebarPrimaryNavigation(
  features: Record<string, boolean> | undefined,
  canAccess: (module: string) => boolean,
  can: (permission: string) => boolean,
  isOwner: boolean,
): PrimaryNavGroup[] {
  return visiblePrimaryNavigation(features, canAccess, can, isOwner);
}

export function sidebarModuleLinks(module: ModuleKey, can: (permission: string) => boolean, moduleAllowed: boolean, features?: Record<string, boolean>): NavConfigItem[] {
  return moduleAllowed ? visibleModuleLinks(module, can, features) : [];
}
