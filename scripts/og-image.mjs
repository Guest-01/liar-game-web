/**
 * 링크 미리보기 카드(public/og.png, 1200×630)를 만든다.
 *
 *      node scripts/og-image.mjs
 *
 * 카카오톡·슬랙은 og:image가 작으면(파비콘) 작은 썸네일로, 1200×630이면 큰 카드로
 * 보여준다. 디자인을 바꿀 때만 다시 돌리고 결과 PNG를 커밋한다 — 빌드 단계가 아니다.
 * E2E와 같은 이유로 로컬 Edge를 쓴다 (브라우저를 내려받지 않는다, playwright.config.ts).
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const icon = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf-8")
  .replace(/width="32" height="32"/, 'width="220" height="220"');

// 색은 client/app.css의 @theme와 같다
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    font-family: Pretendard, system-ui, sans-serif;
    background: radial-gradient(circle at 20% 20%, #1e1b4b 0%, #111827 55%);
    color: #f9fafb; display: flex; align-items: center; gap: 72px; padding: 0 110px;
  }
  .icon { flex: none; width: 260px; height: 260px; border-radius: 56px;
          background: rgba(99,102,241,.12); display: grid; place-items: center; }
  h1 { font-size: 112px; font-weight: 800; letter-spacing: -2px; line-height: 1.1;
       background: linear-gradient(90deg, #6366f1, #8b5cf6);
       -webkit-background-clip: text; background-clip: text; color: transparent; }
  p { margin-top: 24px; font-size: 40px; color: #d1d5db; line-height: 1.4; }
  .tag { margin-top: 36px; display: inline-block; padding: 10px 22px; border-radius: 999px;
         background: rgba(245,158,11,.15); color: #f59e0b; font-size: 28px; font-weight: 600; }
</style></head>
<body>
  <div class="icon">${icon}</div>
  <div>
    <h1>라이어 게임</h1>
    <p>링크 하나로 모여<br>라이어를 찾아내는 실시간 추리 게임</p>
    <span class="tag">로그인 없이 · 4~10명</span>
  </div>
</body></html>`;

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const out = new URL("../public/og.png", import.meta.url);
await page.screenshot({ path: out.pathname.replace(/^\/([A-Za-z]:)/, "$1") });
await browser.close();
console.log("✔ public/og.png");
