/**
 * أقسام صفحة الإدارة — نفس مفاتيح الصلاحيات في lb_permission_keys() بالقاعدة.
 * تبويب users خارجها: للمسؤول الكامل فقط ولا يُمنح لغيره.
 */
export const ADMIN_TABS = [
  'periods', 'deals', 'celebrate', 'messages', 'agents', 'teams',
  'reports', 'data', 'newsfeed', 'rates', 'devices', 'storage',
] as const

export type AdminSection = (typeof ADMIN_TABS)[number]
export type AdminTab = AdminSection | 'users'

/** مفتاح الترجمة لاسم التبويب. */
export function tabLabelKey(name: AdminTab): string {
  switch (name) {
    case 'storage': return 'admin.storage.tab'
    case 'messages': return 'messages.tab'
    case 'devices': return 'devices.tab'
    case 'rates': return 'rates.tab'
    case 'newsfeed': return 'newsAdmin.tab'
    case 'users': return 'users.tab'
    default: return `admin.${name}`
  }
}
