import { expect, test } from '@playwright/test'

const widths = [375, 768, 1440]
const pages = ['./', 'products/JJ-01', 'products/JJ-03', 'login', 'orders']

for (const width of widths) {
  test(`${width}px：无横向溢出、图片不变形、操作栏不遮挡`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 })
    await page.goto('login')
    await page.evaluate(() => localStorage.clear())
    await page.goto('login')
    await page.getByRole('button', { name: '用体验账号登录' }).click()

    for (const path of pages) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} 横向溢出`).toBeLessThanOrEqual(0)

      // 商品图按比例裁切（cover），不会被拉伸：object-fit 为 fill 且显示比例与原图不同即视为变形
      const distorted = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLImageElement>('main img')]
          .filter((img) => img.clientWidth > 0 && img.naturalWidth > 0)
          .filter((img) => {
            const fit = getComputedStyle(img).objectFit
            const shown = img.clientWidth / img.clientHeight
            const natural = img.naturalWidth / img.naturalHeight
            return fit === 'fill' && Math.abs(shown - natural) > 0.02
          })
          .map((img) => img.src),
      )
      expect(distorted, `${path} 图片变形`).toEqual([])
    }

    // 手机底部购买栏不遮挡页面最后的内容
    await page.goto('products/JJ-01')
    await page.waitForLoadState('networkidle')
    const bar = page.getByRole('region', { name: '购买' })
    if (width <= 720) {
      await expect(bar).toBeVisible()
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      const covered = await page.evaluate(() => {
        const barTop = document.querySelector('.buy-bar')!.getBoundingClientRect().top
        const last = document.querySelector('.about')!.getBoundingClientRect().bottom
        return last > barTop
      })
      expect(covered).toBe(false)
    } else {
      await expect(bar).toBeHidden()
    }
  })
}
