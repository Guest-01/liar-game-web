// 경량 라우터. 경로가 3개뿐이라 라이브러리를 쓰지 않는다.
// URL은 절대 바꾸지 않는다: / · /create · /room/:id (이미 공유된 링크가 있다)

export type Route =
  | { name: "lobby" }
  | { name: "create" }
  | { name: "room"; roomId: string };

export function parse(pathname: string): Route {
  if (pathname === "/create") return { name: "create" };
  const m = /^\/room\/([A-Za-z0-9_-]+)\/?$/.exec(pathname);
  if (m) return { name: "room", roomId: m[1]! };
  return { name: "lobby" };
}

export const route = $state<{ current: Route }>({ current: parse(location.pathname) });

export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  route.current = parse(path);
}

addEventListener("popstate", () => { route.current = parse(location.pathname); });
