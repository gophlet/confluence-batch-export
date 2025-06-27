import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const downloadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'downloads');
await fs.mkdir(downloadsDir, { recursive: true });

function sanitize(name) {
  return name.replace(/[<>:"/\\|?*\n\r]+/g, '').trim();
}

const SHORT_TIMEOUT = 50;

const RETRY_TIMEOUT = 1000;

const DEFAULT_TIMEOUT = 15000;

const LONG_TIMEOUT = 60000;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

await context.addCookies([
  {
    name: 'tenant.session.token',
    value: process.env.CONFLUENCE_TOKEN,
    domain: 'axitrader.atlassian.net',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  }
]);

await page.goto(process.env.CONFLUENCE_HOME_URL);

console.log('⏳ 正在加载页面');

await Promise.race([page.waitForSelector('button:has-text("查看更多")', { timeout: DEFAULT_TIMEOUT }), page.waitForSelector('[data-testid="spinner-wrapper"]', { timeout: DEFAULT_TIMEOUT })]);

console.log('✅ 页面加载完成');

while (true) {
  await page.waitForTimeout(SHORT_TIMEOUT);

  const isLoadingVisible = await page
    .locator('[data-testid="spinner-wrapper"]')
    .isVisible()
    .catch(() => false);
  if (isLoadingVisible) {
    console.log('⏳ 正在等待 loading 动画结束...');
    await page.waitForSelector('[data-testid="spinner-wrapper"]', { state: 'detached', timeout: DEFAULT_TIMEOUT });
    continue;
  }

  const seeMoreBtn = page.getByRole('button', { name: '查看更多' });
  const seeMoreVisible = await seeMoreBtn.isVisible().catch(() => false);

  if (seeMoreVisible) {
    console.log('📖 点击查看更多');
    await seeMoreBtn.click();
    continue;
  }

  console.log('✅ 文档列表已加载完毕');
  break;
}

const pages = await page.$$eval('div[role="listitem"]', (items) => {
  return items
    .map((item) => {
      const anchor = item.querySelector('a[data-testid="space-views-list-item"]');
      const titleSpan = item.querySelector('[data-item-title="true"]');

      if (!anchor || !anchor.href || !titleSpan) return null;

      return {
        href: anchor.href,
        title: titleSpan.textContent?.trim() || 'Untitled'
      };
    })
    .filter(Boolean);
});

console.log(`📄 共找到 ${pages.length} 个文档`);

const startTime = Date.now();

for (let i = 0; i < pages.length; i++) {
  const { href, title } = pages[i];
  console.log(`📄 正在处理文档 (${i + 1}/${pages.length})：${title}`);

  const filename = sanitize(title) + '.pdf';
  const filePath = path.join(downloadsDir, filename);

  try {
    await fs.access(filePath);
    console.log(`⏩ 已存在，跳过：${filename}`);
    continue;
  } catch {}

  try {
    await page.goto(href, { waitUntil: 'domcontentloaded' });

    while (true) {
      try {
        await page.waitForSelector('[data-test-id="page-more-action-button"]', { timeout: RETRY_TIMEOUT });
        await page.click('[data-test-id="page-more-action-button"]');
        await page.waitForSelector('[data-testid="export-button"]', { timeout: RETRY_TIMEOUT });
        await page.click('[data-testid="export-button"]');
        await page.waitForSelector('a[data-testid="action-export-pdf-link"]', { timeout: RETRY_TIMEOUT });
        break;
      } catch (e) {
        console.log('⚠️ 更多操作按钮点击失败，等待重试...');
        await page.waitForTimeout(SHORT_TIMEOUT);
      }
    }

    await Promise.all([page.waitForURL(/pdfpageexport\.action/, { timeout: DEFAULT_TIMEOUT }), page.click('a[data-testid="action-export-pdf-link"]')]);

    console.log(`📥 已跳转到导出页面`);

    await page.waitForSelector('#downloadableLink_dynamic', { timeout: LONG_TIMEOUT });

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadableLink_dynamic')]);

    try {
      await download.saveAs(filePath);
      console.log(`✅ 保存完成：${filename}`);
    } catch (saveErr) {
      console.error(`❌ 保存文件失败：${filename}，错误：`, saveErr);
    }
  } catch (err) {
    console.error(`❌ 处理文档失败：${title}，错误：`, err);
    continue;
  }
}

const endTime = Date.now();
const durationMs = endTime - startTime;
const durationMin = Math.floor(durationMs / 60000);
const durationSec = Math.floor((durationMs % 60000) / 1000);
console.log(`🎉 全部完成，总耗时：${durationMin} 分 ${durationSec} 秒`);

await browser.close();
process.exit(0);
