// Online catalog checks stay enabled during packaged acceptance. Dismiss only
// their notification so an asynchronously arriving modal cannot block an
// unrelated Settings action; explicit update checks remain in the UI tests.
export const resourceUpdateNotice = page => page.getByRole('dialog', { name: /^(发现资源更新|Resource updates available)$/u })
export async function handleResourceUpdateNotices(page) {
  const notice = resourceUpdateNotice(page)
  await page.addLocatorHandler(notice, async () => {
    await notice.getByRole('button', { name: /^(关闭|Close)$/u }).first().click()
  })
}
