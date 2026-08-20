import { readFileSync } from "node:fs";

/**
 * 경로별 OG 메타 태그를 주입한 HTML 셸을 만든다.
 *
 * `/room/:id`는 robots.txt로 색인에서 제외하지만, **카카오톡 등에서 링크를
 * 공유할 때 미리보기가 나와야 하므로 OG 태그 자체는 필요하다.**
 */
const DEFAULT_DESC = "누가 라이어인지 찾아내는 실시간 온라인 추리 게임";

type Meta = { title: string; description: string; path: string };

function metaFor(path: string): Meta {
  if (path === "/create") {
    return { title: "방 만들기 - 라이어 게임", description: "새로운 게임 방을 만들고 친구들을 초대하세요.", path };
  }
  if (path.startsWith("/room/")) {
    return { title: "게임 방 - 라이어 게임", description: "지금 참가해서 라이어를 찾아보세요!", path };
  }
  return { title: "라이어 게임", description: DEFAULT_DESC, path: "/" };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function createShellRenderer(indexPath: string, baseUrl: string) {
  // 프로덕션에서는 한 번만 읽는다. 개발에서는 Vite가 셸을 직접 서빙한다.
  const template = readFileSync(indexPath, "utf-8");

  return (path: string): string => {
    const m = metaFor(path);
    const url = baseUrl + m.path;
    const head = [
      `<title>${esc(m.title)}</title>`,
      `<meta name="description" content="${esc(m.description)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${esc(m.title)}">`,
      `<meta property="og:description" content="${esc(m.description)}">`,
      `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:locale" content="ko_KR">`,
      `<meta property="og:site_name" content="라이어 게임">`,
      // 카카오톡·슬랙 등의 링크 미리보기 썸네일
      `<meta property="og:image" content="${esc(baseUrl)}/favicon.png">`,
      `<meta name="twitter:card" content="summary">`,
    ].join("\n  ");
    return template.replace("<!--APP_HEAD-->", head);
  };
}
