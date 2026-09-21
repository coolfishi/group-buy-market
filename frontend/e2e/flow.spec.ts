import { expect, test, type Page } from '@playwright/test'

async function fresh(page: Page, path = './') {
  await page.goto(path)
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(path)
}

test('浏览筛选 → 登录 → 参团 → 模拟支付 → 订单 → 退单，刷新后保持', async ({ page }) => {
  await fresh(page)
  await expect(page.getByText('演示模式')).toBeVisible()

  // 搜索与筛选
  const search = page.getByRole('searchbox', { name: '搜索展品' })
  await search.fill('不存在的款式')
  await expect(page.getByText('没有找到“不存在的款式”相关的展品')).toBeVisible()
  await page.getByRole('button', { name: '清除筛选' }).click()
  await page.getByRole('button', { name: '咒术回战' }).click()
  await expect(page.getByText('共 3 件')).toBeVisible()
  await page.getByRole('link', { name: /五条悟/ }).first().click()

  // 未登录点击参团 → 登录 → 回到商品页并恢复购买意图
  await expect(page.getByRole('heading', { level: 1, name: 'POP UP PARADE 五条悟' })).toBeVisible()
  await page.locator('#teams').getByRole('button', { name: '参与拼团' }).first().click()
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await page.getByRole('button', { name: '用体验账号登录' }).click()
  await expect(page).toHaveURL(/\/products\/JJ-01/)

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '确认参与拼团' })).toBeVisible()
  const confirm = dialog.getByRole('button', { name: /确认参团/ })
  await confirm.click()
  await expect(dialog.getByRole('heading', { name: '模拟收银台' })).toBeVisible()
  // 收银台处理中 Esc 不能关闭
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /确认支付/ }).click()
  await expect(dialog.getByRole('heading', { name: '拼团成功' })).toBeVisible()
  await dialog.getByRole('link', { name: '查看订单' }).click()

  await expect(page).toHaveURL(/\/orders/)
  const row = page.locator('li.order').first()
  await expect(row.getByText('拼团成功')).toBeVisible()

  await page.reload()
  await expect(page.locator('li.order').first().getByText('拼团成功')).toBeVisible()

  // 退单 → 退款处理中 → 已退款
  await page.locator('li.order').first().getByRole('button', { name: '申请退单' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认退单' }).click()
  await expect(page.locator('li.order').first().getByText('退款处理中')).toBeVisible()
  await expect(page.locator('li.order').first().getByText('已退款')).toBeVisible({ timeout: 20_000 })
})

test('开团后取消支付，订单关闭', async ({ page }) => {
  await fresh(page, 'login')
  await page.getByRole('button', { name: '用体验账号登录' }).click()
  await expect(page).not.toHaveURL(/\/login/)
  await page.goto('products/JJ-03')
  await page.locator('.buy').getByRole('button', { name: /发起拼团/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /确认开团/ }).click()
  await dialog.getByRole('button', { name: '取消支付' }).click()
  await expect(dialog.getByRole('heading', { name: '已取消支付' })).toBeVisible()
  await page.goto('orders')
  await expect(page.locator('li.order').first().getByText('已关闭')).toBeVisible()
  await expect(page.locator('li.order').first().getByText('已取消支付')).toBeVisible()
})

test('过期与满员的拼团不能参加', async ({ page }) => {
  await fresh(page, 'products/NR-01')
  await expect(page.locator('#teams').getByRole('button', { name: '已满员' })).toBeDisabled()
  await page.goto('products/JJ-02')
  await expect(page.locator('#teams').getByRole('button', { name: '已结束' })).toBeDisabled()
})

test('提交期间按钮禁用，防止重复下单', async ({ page }) => {
  await fresh(page, 'login')
  await page.getByRole('button', { name: '用体验账号登录' }).click()
  await expect(page).not.toHaveURL(/\/login/)
  await page.goto('products/NR-03')
  await page.locator('.buy').getByRole('button', { name: /单独购买/ }).click()
  const btn = page.getByRole('dialog').getByRole('button', { name: /确认购买/ })
  await btn.click()
  await expect(page.getByRole('dialog').getByRole('button', { name: /正在提交|确认支付/ }).last()).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: /确认支付/ }).click()
  await page.goto('orders')
  await expect(page.locator('li.order')).toHaveCount(1)
})

test('弹窗键盘操作与焦点恢复', async ({ page }) => {
  await fresh(page, 'login')
  await page.getByRole('button', { name: '用体验账号登录' }).click()
  await expect(page).not.toHaveURL(/\/login/)
  await page.goto('products/NR-02')
  const trigger = page.locator('.buy').getByRole('button', { name: /单独购买/ })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('订单页需要登录', async ({ page }) => {
  await fresh(page, 'orders')
  await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)orders/)
})
