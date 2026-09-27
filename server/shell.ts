import { readFileSync } from "node:fs";

/**
 * 경로별 OG 메타 태그를 주입한 HTML 셸을 만든다.
 *
 * `/room/:id`는 robots.txt로 색인에서 제외하지만, **카카오톡 등에서 링크를
 * 공유할 때 미리보기가 나와야 하므로 OG 태그 자체는 필요하다.**
 * 초대 링크는 방 이름을 싣는다 — 모든 방이 같은 미리보기면 어느 방인지 모른다.
 */
const DEFAULT_DESC = "누가 라이어인지 찾아내는 실시간 온라인 추리 게임";

/** 링크 미리보기 카드 이미지. 1200×630 (카카오톡·슬랙·X 공통 권장 비율) */
export const OG_IMAGE = { path: "/og.png", width: 1200, height: 630 };

type Meta = { title: string; description: string; path: string };
export type ShellContext = { roomName?: string };

export function metaFor(path: string, ctx: ShellContext = {}): Meta {
  if (path === "/create") {
    return { title: "방 만들기 - 라이어 게임", description: "새로운 게임 방을 만들고 친구들을 초대하세요.", path };
  }
  if (path.startsWith("/room/")) {
    if (ctx.roomName) {
      return {
        title: `${ctx.roomName} - 라이어 게임`,
        description: `"${ctx.roomName}" 방에 초대합니다. 지금 참가해서 라이어를 찾아보세요!`,
        path,
      };
    }
    return { title: "게임 방 - 라이어 게임", description: "지금 참가해서 라이어를 찾아보세요!", path };
  }
  return { title: "라이어 게임", description: DEFAULT_DESC, path: "/" };
}

// 방 이름은 사용자 입력이다. 속성값 안에 들어가므로 반드시 이스케이프한다.
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderHead(path: string, baseUrl: string, ctx: ShellContext = {}): string {
  const m = metaFor(path, ctx);
  const url = baseUrl + m.path;
  return [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:locale" content="ko_KR">`,
    `<meta property="og:site_name" content="라이어 게임">`,
    // 카카오톡·슬랙 등의 링크 미리보기 카드. 크기를 밝혀야 첫 공유부터 큰 카드로 나온다.
    `<meta property="og:image" content="${esc(baseUrl + OG_IMAGE.path)}">`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}">`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join("\n  ");
}

export function createShellRenderer(indexPath: string, baseUrl: string) {
  // 프로덕션에서는 한 번만 읽는다. 개발에서는 Vite가 셸을 직접 서빙한다.
  const template = readFileSync(indexPath, "utf-8");
  return (path: string, ctx: ShellContext = {}): string =>
    template.replace("<!--APP_HEAD-->", renderHead(path, baseUrl, ctx));
}
