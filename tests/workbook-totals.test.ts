import { describe, expect, it } from 'vitest'
import { buildWorkbook, parseWorkbook } from '@/lib/workbook'

describe('workbook q_total column', () => {
  it('round-trips the quarter total and treats a blank cell as no edit', async () => {
    const blob = await buildWorkbook(
      {
        teams: [{ name: 'Fighters', name_ar: null, photo_url: null }],
        agents: [
          {
            name: 'Ahmed', name_ar: null, team: 'Fighters', photo_url: null,
            periods: [{ quarter: 3, target: 100, deals: 20, total: 70 }, { quarter: 4, target: 50, deals: 0 }],
          },
        ],
        deals: [],
      },
      2026,
    )
    const { payload } = await parseWorkbook(new File([blob], 'x.xlsx'))
    const periods = payload.agents[0].periods
    expect(periods.find((p) => p.quarter === 3)?.total).toBe(70)
    expect(periods.find((p) => p.quarter === 4)?.total).toBeNull()
  })
})
