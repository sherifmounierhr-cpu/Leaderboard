import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ADMIN_TABS, NAV_GROUPS, navItem, tabLabelKey, visibleNav } from '../src/lib/adminTabs'

/** مفاتيح lb_permission_keys() في آخر migration عرّفتها — لو القاعدة اتغيّرت والواجهة لأ، يفشل هنا. */
function sqlPermissionKeys(): string[] {
  const dir = join(__dirname, '..', 'supabase', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  let found: string[] | null = null
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8')
    const m = sql.match(/function public\.lb_permission_keys\(\)[\s\S]*?select array\[([^\]]+)\]/)
    if (m) found = [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1])
  }
  return found ?? []
}

describe('admin navigation', () => {
  const allItems = NAV_GROUPS.flatMap((g) => g.items)

  it('every permission section the database knows has a tab, and vice versa', () => {
    expect([...ADMIN_TABS].sort()).toEqual(sqlPermissionKeys().sort())
    const tabKeys = allItems.map((i) => i.key as string)
    for (const key of ADMIN_TABS) expect(tabKeys).toContain(key)
  })

  it('tab keys are unique and every group has items', () => {
    const keys = allItems.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const g of NAV_GROUPS) expect(g.items.length).toBeGreaterThan(0)
  })

  it('every tab has an icon, a label key and at least one permission', () => {
    for (const item of allItems) {
      expect(item.icon).toMatch(/^mdi:/)
      expect(item.label).toBeTruthy()
      expect(item.needs.length).toBeGreaterThan(0)
    }
  })

  it('a full admin sees everything; an editor only their sections', () => {
    const admin = visibleNav([...ADMIN_TABS, 'users'], false).flatMap((g) => g.items.map((i) => i.key))
    expect(admin).toHaveLength(allItems.length)
    const editor = visibleNav(['deals', 'periods'], false).flatMap((g) => g.items.map((i) => i.key))
    expect(editor).toEqual(['periods', 'deals'])
  })

  it('staff managers see the users tab only with staff_accounts, never the audit log', () => {
    const keys = (perms: string[]) => visibleNav(perms, false).flatMap((g) => g.items.map((i) => i.key))
    expect(keys(['deals'])).not.toContain('users')
    expect(keys(['deals', 'staff_accounts'])).toContain('users')
    expect(keys(['deals', 'staff_accounts'])).not.toContain('audit')
  })

  it('directors follow the celebrate section; audit is admin-only', () => {
    const keys = (perms: string[]) => visibleNav(perms, false).flatMap((g) => g.items.map((i) => i.key))
    expect(keys(['celebrate'])).toContain('directors')
    expect(keys(['messages'])).not.toContain('directors')
    expect(keys(['users'])).toContain('audit')
  })

  it('demo accounts see every section tab but not users or the audit log', () => {
    const keys = visibleNav([], true).flatMap((g) => g.items.map((i) => i.key))
    for (const key of ADMIN_TABS) expect(keys).toContain(key)
    expect(keys).not.toContain('users')
    expect(keys).not.toContain('audit')
  })

  it('label helper falls back for unknown keys', () => {
    expect(tabLabelKey('deals')).toBe('admin.deals')
    expect(navItem('audit')?.label).toBe('nav.audit')
  })
})
