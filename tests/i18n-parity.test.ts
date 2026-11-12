import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = (lang: string) => join(__dirname, '..', 'src', 'i18n', 'locales', lang)

function leaves(value: unknown, prefix: string, out: string[]) {
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) leaves(v, prefix ? `${prefix}.${k}` : k, out)
  } else out.push(prefix)
}

function keysOf(lang: string): string[] {
  const out: string[] = []
  for (const file of readdirSync(dir(lang)).filter((f) => f.endsWith('.json'))) {
    leaves(JSON.parse(readFileSync(join(dir(lang), file), 'utf8')), file.replace(/\.json$/, ''), out)
  }
  return out.sort()
}

describe('translations', () => {
  it('Arabic and English have the same sections', () => {
    expect(readdirSync(dir('ar')).sort()).toEqual(readdirSync(dir('en')).sort())
  })

  it('every key exists in both languages', () => {
    const ar = new Set(keysOf('ar'))
    const en = new Set(keysOf('en'))
    expect([...ar].filter((k) => !en.has(k))).toEqual([])
    expect([...en].filter((k) => !ar.has(k))).toEqual([])
  })
})
