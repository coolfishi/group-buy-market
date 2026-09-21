import { expect, test } from '@playwright/test'

const widths = [375, 768, 1440]
const pages = ['/', '/products/TS-2001', '/products/TS-3002', '/login', '/orders']

for (const width of widths) {
  test(`${width}px：无横向溢出、图片不变形、操作栏不遮挡`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 })
    await page.goto('/login')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/login')
    await page.getByRole('button', { name: '用体验账号登录' }).click()

    for (const path of pages) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} 横向溢出`).toBeLessThanOrEqual(0)

      // 商品图容器保持正方形，图片以 contain 显示
      const distorted = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLImageElement>('.plinth img, .main img, .thumb img, .art img')]
          .filter((img) => img.clientWidth > 0)
          .filter((img) => getComputedStyle(img).objectFit !== 'contain' || Math.abs(img.clientWidth - img.clientHeight) > 2)
          .map((img) => img.src),
      )
      expect(distorted, `${path} 图片变形`).toEqual([])
    }

    // 手机底部购买栏不遮挡页面最后的内容
    await page.goto('/products/TS-2001')
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
