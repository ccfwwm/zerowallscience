import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'

// Exercise the actual settings slots and persisted language selector in the
// packaged renderer. No reload, mocked locale service or real account needed.
export async function verifySettingsLocales(page, settings, root) {
  try {
    for (const english of [true, false]) {
      await settings.getByRole('button', { name: /^(通用设置|General)$/ }).click()
      await settings.getByRole('button', { name: /^(中文|English)$/ }).click()
      await page.getByRole('menuitem', { name: english ? 'English' : '中文', exact: true }).click()
      const names = english
        ? ['AI Cloud', 'Python environment', 'SSH resources', 'About']
        : ['AI 云平台', 'Python 环境', 'SSH 资源', '关于']
      for (const name of names) await settings.getByRole('button', { name, exact: true }).waitFor({ state: 'visible' })
      const locale = english ? 'en' : 'zh'
      await settings.getByRole('button', { name: names[0], exact: true }).click()
      await settings.getByText(english ? 'Your password will not be saved. Enter it again after signing out.' : '不保存密码，退出后需要重新输入。', { exact: true }).waitFor({ state: 'hidden' })
      await settings.getByText(english ? 'After signing in, your credentials are saved securely on this device and filled in automatically next time.' : '登录成功后，账号密码保存在本机安全存储；退出后自动填写。', { exact: true }).waitFor({ state: 'visible' })
      // The packaged desktop must have the secure broker, unlike a CLI browser.
      if (/credential IPC is unavailable|Open this page from|请通过 ZeroWall Science 桌面应用/.test(await settings.innerText())) throw new Error('Desktop account credential broker is unavailable')
      await assertLanguage(settings, english)
      await page.screenshot({ path: resolve(root, `settings-account-${locale}.png`), fullPage: true })
      await settings.getByRole('button', { name: names[1], exact: true }).click()
      await settings.getByRole('heading', { name: names[1], exact: true }).waitFor({ state: 'visible' })
      await assertLanguage(settings, english)
      await page.screenshot({ path: resolve(root, `settings-python-${locale}.png`), fullPage: true })
      await settings.getByRole('button', { name: names[2], exact: true }).click()
      await settings.getByRole('button', { name: english ? 'Add server' : '新增服务器', exact: true }).click()
      await page.getByText(english ? 'Default project directory' : '默认项目目录', { exact: true }).waitFor({ state: 'visible' })
      await assertLanguage(settings, english)
      await page.screenshot({ path: resolve(root, `settings-ssh-${locale}.png`), fullPage: true })
      await page.getByRole('button', { name: english ? 'Cancel' : '取消', exact: true }).click()
      await settings.getByRole('button', { name: english ? 'Add shared credentials' : '新增共享凭据', exact: true }).click()
      await page.getByText(english ? 'Choose private key file' : '选择私钥文件', { exact: true }).waitFor({ state: 'visible' })
      await assertLanguage(settings, english)
      await page.getByRole('button', { name: english ? 'Cancel' : '取消', exact: true }).click()
      await settings.getByRole('button', { name: names[3], exact: true }).click()
      await settings.getByRole('button', { name: english ? 'Check for updates' : '检查更新', exact: true }).waitFor({ state: 'visible' })
      await assertLanguage(settings, english)
      await page.screenshot({ path: resolve(root, `settings-about-${locale}.png`), fullPage: true })
    }
    console.log(`Packaged settings English/Chinese live switch verified: account, Python, SSH resources/credentials and About. Evidence: ${root}`)
  } catch (error) {
    await page.screenshot({ path: resolve(root, 'settings-failure.png'), fullPage: true })
    await writeFile(resolve(root, 'settings-failure.txt'), await page.locator('body').innerText())
    throw new Error(`${error.message}\nSettings evidence: ${root}`)
  }
}

async function assertLanguage(settings, english) {
  if (!english) return
  const text = await settings.innerText()
  if (/\p{Script=Han}/u.test(text)) throw new Error(`Chinese copy remains in English settings: ${text.match(/[^\n]*\p{Script=Han}[^\n]*/gu)?.join('; ')}`)
}
