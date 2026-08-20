import { expect, test, type Page } from "@playwright/test";

/**
 * 실브라우저 스모크. 여러 탭이 실제 WebSocket으로 동기화되는지를 본다.
 * happy-dom으로는 확인할 수 없는 영역이다.
 */

async function setNickname(page: Page, nickname: string) {
  await page.addInitScript((n) => localStorage.setItem("nickname", n), nickname);
}

/**
 * 플레이어 목록의 항목.
 *
 * 닉네임만으로 찾으면 시스템 채팅("○○님이 입장했습니다")까지 걸려
 * strict mode violation이 난다. 대기실에서 `listitem`은 PlayerList뿐이다.
 */
const playerItem = (page: Page, nickname: string) =>
  page.getByRole("listitem").filter({ hasText: nickname });

test("로비가 뜬다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "라이어 게임" })).toBeVisible();
  await expect(page.getByText("게임 방법")).toBeVisible();
});

test("방을 만들면 대기실로 들어간다", async ({ page }) => {
  await setNickname(page, "호스트");
  await page.goto("/create");
  await page.getByPlaceholder("방 이름을 입력하세요").fill("스모크방");
  await page.getByRole("button", { name: "방 만들기" }).click();

  await expect(page).toHaveURL(/\/room\/[A-Za-z0-9_-]+/);
  await expect(page.getByText("게임 설정")).toBeVisible();
  await expect(playerItem(page, "호스트")).toBeVisible();
  // 혼자면 시작할 수 없다 (최소 4명)
  await expect(page.getByRole("button", { name: /최소 4명/ })).toBeDisabled();

  // 방을 만든 직후 자기 자신에게 재접속하면 안 된다.
  // 채팅에 남는 시스템 메시지가 그 증거다 (client/integration.test.ts의 짝).
  await expect(page.getByText("접속이 끊겼습니다")).toHaveCount(0);
});

test("★ 두 번째 참가자가 첫 번째 화면에 실시간으로 나타난다", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const hostPage = await hostCtx.newPage();
  await setNickname(hostPage, "앨리스");
  await hostPage.goto("/create");
  await hostPage.getByPlaceholder("방 이름을 입력하세요").fill("동기화방");
  await hostPage.getByRole("button", { name: "방 만들기" }).click();
  await expect(hostPage).toHaveURL(/\/room\//);
  const roomUrl = hostPage.url();

  const guestCtx = await browser.newContext();
  const guestPage = await guestCtx.newPage();
  await setNickname(guestPage, "보라매");
  await guestPage.goto(roomUrl);

  // 서버 상태가 양쪽에 반영된다
  await expect(playerItem(hostPage, "보라매")).toBeVisible();
  await expect(playerItem(guestPage, "앨리스")).toBeVisible();
  await expect(guestPage.getByText("호스트가 게임을 시작할 때까지")).toBeVisible();

  await hostCtx.close();
  await guestCtx.close();
});

test("채팅이 두 탭 사이를 왕복한다", async ({ browser }) => {
  const a = await browser.newContext(); const pa = await a.newPage();
  await setNickname(pa, "앨리스");
  await pa.goto("/create");
  await pa.getByPlaceholder("방 이름을 입력하세요").fill("채팅방");
  await pa.getByRole("button", { name: "방 만들기" }).click();
  await expect(pa).toHaveURL(/\/room\//);

  const b = await browser.newContext(); const pb = await b.newPage();
  await setNickname(pb, "보라매");
  await pb.goto(pa.url());
  await expect(playerItem(pb, "앨리스")).toBeVisible();

  await pb.getByPlaceholder("메시지 입력…").fill("안녕하세요");
  await pb.getByRole("button", { name: "전송" }).click();
  await expect(pa.getByText("안녕하세요")).toBeVisible();

  await a.close(); await b.close();
});

test("없는 방으로 가면 로비로 돌아온다", async ({ page }) => {
  await setNickname(page, "길잃은사람");
  await page.goto("/room/EXISTS-NOT");
  await expect(page).toHaveURL("/");
});
