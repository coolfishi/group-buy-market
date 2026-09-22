import { describe, expect, it } from 'vitest'
import { payPriceOf, planTeam, type ActivityCandidate } from '../src/demoTeams.js'

const now = new Date('2026-09-22T12:00:00+08:00')
const c: ActivityCandidate = {
  goodsId: 'JJ-02',
  activityId: 200205,
  target: 3,
  validTime: 120,
  activityStart: new Date('2026-09-01T00:00:00+08:00'),
  activityEnd: new Date('2027-09-01T00:00:00+08:00'),
  originalPrice: 199,
  marketPlan: 'ZJ',
  marketExpr: '30',
  openTeams: 0,
}

describe('演示拼团', () => {
  it('拼团价与 Java 端四种优惠一致', () => {
    expect(payPriceOf(199, 'ZJ', '30')).toBe(169)
    expect(payPriceOf(199, 'MJ', '100,10')).toBe(189)
    expect(payPriceOf(80, 'MJ', '100,10')).toBe(80)
    expect(payPriceOf(199, 'ZK', '0.8')).toBe(159)
    expect(payPriceOf(199, 'N', '9.9')).toBe(9.9)
    expect(payPriceOf(10, 'ZJ', '30')).toBe(0.01)
  })

  it('队伍规划：成员数在 1 到 target-1 之间，截止时间在未来且不超过拼团时长', () => {
    for (let i = 0; i < 200; i++) {
      const p = planTeam(c, now)
      expect(p.members.length).toBeGreaterThanOrEqual(1)
      expect(p.members.length).toBeLessThanOrEqual(c.target - 1)
      expect(p.teamId).toMatch(/^\d{8}$/)
      const remain = (p.validEnd.getTime() - now.getTime()) / 60_000
      expect(remain).toBeGreaterThanOrEqual(40)
      expect(remain).toBeLessThanOrEqual(c.validTime)
      expect(p.validEnd.getTime() - p.validStart.getTime()).toBe(c.validTime * 60_000)
      expect(p.validStart.getTime()).toBeLessThanOrEqual(now.getTime())
    }
  })

  it('截止时间不超过活动结束时间', () => {
    const ending = { ...c, activityEnd: new Date(now.getTime() + 10 * 60_000) }
    expect(planTeam(ending, now).validEnd.getTime()).toBe(ending.activityEnd.getTime())
  })
})
