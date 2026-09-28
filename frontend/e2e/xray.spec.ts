import { expect, test } from '@playwright/test'

test('透视模式：?xray=1 打开，下单链路逐步出现在面板里，可关闭', async ({ page }) => {
  await page.goto('login')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto('login?xray=1')
  const panel = page.getByRole('complementary', { name: '透视' })
  await expect(panel).toBeVisible()
  await expect(panel.getByText('演示站：请求在本地模拟')).toBeVisible()

  await page.getByRole('button', { name: '用体验账号登录' }).click()
  await expect(page).not.toHaveURL(/\/login/)

  // 刷新 / 跳转后开关保持
  await page.goto('products/NR-02')
  await expect(panel.getByRole('button', { name: /拼团价试算/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '规则树试算' })).toBeVisible()

  await page.locator('.buy').getByRole('button', { name: /发起拼团/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /确认开团/ }).click()

  // 锁单条目自动展开，能看到责任链里的 Redis 名额过滤器
  const lock = panel.getByRole('listitem').filter({ has: page.getByRole('button', { name: /拼团锁单/ }) })
  await expect(lock.getByText('TeamStockOccupyRuleFilter', { exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: /确认支付/ }).click()
  await expect(panel.getByRole('button', { name: /付款到账/ })).toBeVisible()
  await expect(panel.locator('[aria-current="step"]')).toHaveText(/结算/)

  // 弹窗打开时面板在遮罩之上，仍可操作；关掉弹窗后用页头开关重新打开
  await dialog.getByRole('button', { name: '继续逛逛' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '关闭透视模式' }).click()
  await expect(panel).toBeHidden()
  await expect(page.getByRole('button', { name: '规则树试算' })).toBeHidden()
  await page.getByRole('button', { name: /透视/ }).first().click()
  await expect(panel).toBeVisible()
})
