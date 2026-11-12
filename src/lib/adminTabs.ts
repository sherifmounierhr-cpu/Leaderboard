/**
 * تنقّل صفحة الإدارة — المصدر الوحيد: المجموعات والتبويبات وأيقوناتها وعناوينها
 * وصلاحية كل تبويب. AdminView بيبني الشريط الجانبي منه، واختبار tests/admin-nav
 * بيتأكد إنه متطابق مع lb_permission_keys() في القاعدة.
 *
 * مفاتيح الصلاحية (ADMIN_TABS) غير مفاتيح التبويبات: تبويب «مدراء الشركة» مثلاً
 * بيتحكم فيه قسم `celebrate`، وتبويب «سجل العمليات» للمسؤول الكامل (`users`).
 */
export const ADMIN_TABS = [
  'periods', 'deals', 'celebrate', 'messages', 'agents', 'teams',
  'reports', 'data', 'newsfeed', 'rates', 'devices', 'storage',
  'owner1', 'owner2',
] as const

export type AdminSection = (typeof ADMIN_TABS)[number]
/** تبويبات خارج مفاتيح الصلاحيات: users/audit للمسؤول، directors تحت قسم celebrate. */
export type AdminTab = AdminSection | 'users' | 'directors' | 'audit'

export type NavGroupKey = 'people' | 'sales' | 'screen' | 'system'

interface NavItem {
  key: AdminTab
  icon: string
  /** مفتاح الترجمة للعنوان. */
  label: string
  /** يظهر لو الحساب معاه أي واحدة من دول (أو حساب عرض). 'users' = مسؤول كامل، 'staff_accounts' = مدير إداري. */
  needs: readonly string[]
}

export interface NavGroup {
  key: NavGroupKey
  icon: string
  label: string
  items: readonly NavItem[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: 'people', icon: 'mdi:account-group-outline', label: 'nav.group.people',
    items: [
      { key: 'agents', icon: 'mdi:account-tie-outline', label: 'admin.agents', needs: ['agents'] },
      { key: 'teams', icon: 'mdi:account-group-outline', label: 'admin.teams', needs: ['teams'] },
      { key: 'directors', icon: 'mdi:star-circle-outline', label: 'nav.directors', needs: ['celebrate'] },
      { key: 'owner1', icon: 'mdi:account-tie-voice-outline', label: 'owners.tab1', needs: ['owner1'] },
      { key: 'owner2', icon: 'mdi:account-tie-voice-outline', label: 'owners.tab2', needs: ['owner2'] },
      { key: 'users', icon: 'mdi:shield-account-outline', label: 'users.tab', needs: ['users', 'staff_accounts'] },
    ],
  },
  {
    key: 'sales', icon: 'mdi:chart-timeline-variant', label: 'nav.group.sales',
    items: [
      { key: 'periods', icon: 'mdi:target', label: 'admin.periods', needs: ['periods'] },
      { key: 'deals', icon: 'mdi:handshake-outline', label: 'admin.deals', needs: ['deals'] },
      { key: 'reports', icon: 'mdi:file-chart-outline', label: 'admin.reports', needs: ['reports'] },
      { key: 'data', icon: 'mdi:database-import-outline', label: 'admin.data', needs: ['data'] },
    ],
  },
  {
    key: 'screen', icon: 'mdi:monitor-dashboard', label: 'nav.group.screen',
    items: [
      { key: 'celebrate', icon: 'mdi:party-popper', label: 'admin.celebrate', needs: ['celebrate'] },
      { key: 'messages', icon: 'mdi:message-text-outline', label: 'messages.tab', needs: ['messages'] },
      { key: 'newsfeed', icon: 'mdi:newspaper-variant-outline', label: 'newsAdmin.tab', needs: ['newsfeed'] },
      { key: 'rates', icon: 'mdi:chart-line', label: 'rates.tab', needs: ['rates'] },
      { key: 'devices', icon: 'mdi:monitor-dashboard', label: 'devices.tab', needs: ['devices'] },
    ],
  },
  {
    key: 'system', icon: 'mdi:cog-outline', label: 'nav.group.system',
    items: [
      { key: 'storage', icon: 'mdi:harddisk', label: 'admin.storage.tab', needs: ['storage'] },
      { key: 'audit', icon: 'mdi:clipboard-text-clock-outline', label: 'nav.audit', needs: ['users'] },
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ ...item, group: g.key })))

/** التبويبات المسموحة، مرتّبة بترتيب المجموعات. حساب العرض بيشوف كل تبويبات الأقسام (مش users/audit). */
export function visibleNav(permissions: readonly string[], isDemo: boolean) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      isDemo
        ? item.needs.every((n) => (ADMIN_TABS as readonly string[]).includes(n))
        : item.needs.some((n) => permissions.includes(n)),
    ),
  })).filter((group) => group.items.length)
}

export function navItem(key: AdminTab) {
  return ALL_ITEMS.find((item) => item.key === key)
}

/** مفتاح الترجمة لاسم تبويب أو صلاحية (الصلاحيات بتستخدمه في شاشة المستخدمين). */
export function tabLabelKey(name: AdminTab): string {
  return navItem(name)?.label ?? `admin.${name}`
}
