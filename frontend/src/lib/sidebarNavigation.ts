import { MODULE_NAV, PRIMARY_NAV_GROUPS, type ModuleKey, type NavConfigItem, type PrimaryNavGroup } from "./navigation";

/** Discovery menus show published entries; page/API guards enforce actual access. */
export function sidebarPrimaryNavigation(): PrimaryNavGroup[] {
  return PRIMARY_NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => !item.hidden),
  })).filter(group => group.items.length > 0);
}

export function sidebarModuleLinks(module: ModuleKey): NavConfigItem[] {
  return [...MODULE_NAV[module]];
}
