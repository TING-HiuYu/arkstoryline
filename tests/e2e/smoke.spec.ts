import { expect, test } from '@playwright/test'

test('home page renders main heading', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'ArkStoryline' })).toBeVisible()
})

test('reader page renders chapter shell', async ({ page }) => {
  await page.goto('/zh_CN/read/main_0/main_0--obt__main__level_main_00-01_beg')

  await expect(page.getByRole('heading', { name: '坍塌' })).toBeVisible()
  await expect(page.getByText('相关篇章索引')).toBeVisible()
})
