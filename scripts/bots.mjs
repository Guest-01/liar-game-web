#!/usr/bin/env node
/**
 * 봇 하니스 — 방에 가짜 플레이어를 붙인다.
 *
 * **왜 필요한가.** 혼자서 브라우저 창 4개를 조작하는 것은 사실상 불가능하다.
 * 창을 옮기는 사이에 서버 타이머가 흐르기 때문이다. 실제로 재보니 창 전환 한 번에
 * 약 10초가 들어서, 15초짜리 페이즈(변론·최종투표·정답)는 한 사람 몫도 빠듯했다.
 * 봇은 밀리초 단위로 반응하므로 **사람은 창 하나만** 보면 된다.
 *
 * 서버 입장에서 봇은 사람과 구분되지 않는다 — 브라우저를 거치지 않을 뿐
 * 똑같은 WebSocket 프로토콜을 쓴다.
 *
 *   node scripts/bots.mjs --room AbC123           사람이 만든 방에 봇 3명
 *   node scripts/bots.mjs --create --auto-start   봇 4명이 알아서 한 판 완주
 *   node scripts/bots.mjs --room AbC123 --n 5 --delay 2500
 *
 * 봇이 받은 스냅샷은 매 패치마다 불변식 검사를 통과해야 한다. **타인의 제시어가
 * 보이면 그 자리에서 죽는다** — 정보 은닉의 실전 감시자다 (--no-check로 끈다).
 */
import { Client } from "@colyseus/sdk";

// shared/constants.ts 를 import하지 않는다. 저 파일은 TypeScript이고, scripts/ 는
// tsconfig의 include 밖이다 (넣으면 dist/ 에 개발 스크립트가 섞인다 — 체크리스트 E2).
// dev.mjs 와 같은 계층으로 두고 필요한 값만 옮겨 적는다.
// ⚠️ shared/constants.ts 가 바뀌면 여기도 고칠 것.
const MIN_PLAYERS = 4;
const MAX_DESCRIPTION_ATTEMPTS = 2;
const MAX_DISCUSSION_ATTEMPTS = 2;

// ── 옵션 ─────────────────────────────────────────────

const HELP = `
봇 하니스 — 라이어 게임에 가짜 플레이어를 붙인다.

  --room <id>       참가할 방 ID. 없으면 --create 가 필요하다
  --create          봇이 방을 직접 만든다 (방 ID를 출력한다)
  --n <수>          봇 수 (기본 3, --create 면 4)
  --url <주소>      서버 (기본 ws://localhost:2567)
  --password <pw>   비공개 방 비밀번호
  --room-name <이름> --create 일 때 방 이름 (기본 "봇 테스트")

  --delay <ms>      봇의 기본 반응 지연 (기본 1200)
                    0으로 두면 사람이 화면을 볼 틈이 없다. 너무 크면 타이머를 놓친다
  --auto-start      봇이 호스트이고 인원이 차면 스스로 게임을 시작한다
  --seed <정수>     난수 고정. 같은 시드는 같은 지목·투표를 낸다
  --guess <단어>    봇이 라이어로 몰렸을 때 낼 정답 (기본: 모르는 채로 오답)
  --hint            시민 봇이 설명에 글자 수 힌트를 넣는다 (기본 꺼짐)
  --no-check        불변식 검사를 끈다
  --quiet           행동 로그를 줄인다

예시
  node scripts/bots.mjs --room AbC123
  node scripts/bots.mjs --create --auto-start --seed 42
`;

function parseArgs(argv) {
  const o = {
    url: "ws://localhost:2567", room: null, create: false, n: null,
    password: undefined, roomName: "봇 테스트", delay: 1200,
    autoStart: false, seed: null, guess: null, hint: false,
    check: true, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--room": o.room = next(); break;
      case "--create": o.create = true; break;
      case "--n": o.n = Number(next()); break;
      case "--url": o.url = next(); break;
      case "--password": o.password = next(); break;
      case "--room-name": o.roomName = next(); break;
      case "--delay": o.delay = Number(next()); break;
      case "--auto-start": o.autoStart = true; break;
      case "--seed": o.seed = Number(next()); break;
      case "--guess": o.guess = next(); break;
      case "--hint": o.hint = true; break;
      case "--no-check": o.check = false; break;
      case "--quiet": o.quiet = true; break;
      case "-h": case "--help": console.log(HELP); process.exit(0);
      default:
        console.error(`알 수 없는 옵션: ${a}\n${HELP}`);
        process.exit(1);
    }
  }
  if (!o.room && !o.create) {
    console.error(`--room 또는 --create 중 하나가 필요하다.\n${HELP}`);
    process.exit(1);
  }
  o.n ??= o.create ? MIN_PLAYERS : 3;
  return o;
}

const opts = parseArgs(process.argv.slice(2));

/** 시드를 주면 재현 가능한 난수를 쓴다. fuzz 결과를 다시 돌려보기 위해서다. */
function makeRandom(seed) {
  if (seed === null || Number.isNaN(seed)) return Math.random;
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const rand = makeRandom(opts.seed);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ── 봇이 내는 말 ─────────────────────────────────────

/**
 * 시민 봇도 라이어 봇도 **같은 문구 풀**을 쓴다.
 *
 * 시민 봇이 자기 단어를 흘리면 사람이 하는 게임이 그 자리에서 망가진다.
 * 그렇다고 라이어 봇만 다른 말투를 쓰면 정체가 드러난다. 그래서 양쪽 다
 * 아무것도 말하지 않는 쪽을 택했다 — 봇은 "성의 없는 참가자"로 보인다.
 */
const NEUTRAL = [
  "설명하기 조금 어렵네요",
  "다들 아실 만한 거예요",
  "생각보다 흔하게 볼 수 있어요",
  "저는 좋아하는 편이에요",
  "음... 뭐라고 해야 하나",
  "특별할 건 없어요",
];

const BOT_NAMES = ["봇가", "봇나", "봇다", "봇라", "봇마", "봇바", "봇사", "봇아", "봇자"];

// ── 불변식 ───────────────────────────────────────────

/** 라운드가 "진행 중"인 페이즈. 이때 새면 안 되는 것이 가장 많다. */
const IN_ROUND = new Set([
  "word-check", "order-reveal", "description", "description-reveal",
  "discussion", "defense", "final-vote", "vote-reveal", "liar-guess",
]);

/**
 * 봇이 받은 스냅샷이 규칙을 어기지 않았는지 본다.
 *
 * 서버 테스트가 이미 바이트 수준에서 정보 은닉을 검증하지만, 그것은 정해진
 * 시나리오만 훑는다. 여기서는 **실제로 굴러가는 아무 게임에서나** 계속 본다.
 */
function violations(s, meId) {
  const out = [];
  const players = Object.values(s.players ?? {});

  if (players.length > s.maxPlayers) {
    out.push(`정원 초과: ${players.length}명 > 최대 ${s.maxPlayers}명`);
  }
  if (s.descriptionAttempts > MAX_DESCRIPTION_ATTEMPTS) {
    out.push(`설명 기회 초과: ${s.descriptionAttempts}`);
  }
  if (s.discussionAttempts > MAX_DISCUSSION_ATTEMPTS) {
    out.push(`토론 기회 초과: ${s.discussionAttempts}`);
  }

  if (!IN_ROUND.has(s.phase)) return out;

  // 라운드 진행 중에는 결과가 채워져 있으면 안 된다
  if (s.revealedLiarId) out.push(`라운드 중 라이어 공개: ${s.revealedLiarId}`);
  if (s.revealedCitizenWord) out.push(`라운드 중 제시어 공개: ${s.revealedCitizenWord}`);

  // ★ 남의 비밀은 빈 값이 아니라 키 자체가 없어야 한다 (shared/snapshot.ts)
  // 뷰는 어떤 페이즈에서도 넓어지지 않는다. 라운드가 바뀌어도 마찬가지다 —
  // 결과 공개는 방 수준 revealed* 필드로만 한다 (체크리스트 G13)
  for (const p of players) {
    if (p.id === meId) continue;
    if (p.myWord) out.push(`${p.nickname}의 제시어가 보인다: "${p.myWord}"`);
    if (p.amILiar) out.push(`${p.nickname}의 라이어 여부가 보인다`);
    if (p.myFinalVote) out.push(`${p.nickname}의 찬반이 보인다`);
  }

  // 과반 미달인데 라이어 여부가 채워지면 개표 연출로 정체가 샌다 (fx.test.ts)
  if (s.phase === "vote-reveal" && !s.executionConfirmed && s.defendantWasLiar) {
    out.push("과반 미달인데 defendantWasLiar가 켜져 있다");
  }
  return out;
}

// ── 봇 ───────────────────────────────────────────────

let stopping = false;
const bots = [];

async function spawn(name, roomId) {
  const client = new Client(opts.url);
  const room = roomId
    ? await client.joinById(roomId, { nickname: name, password: opts.password })
    : await client.create("liar", {
        nickname: name, roomName: opts.roomName,
        isPublic: !opts.password, password: opts.password,
      });

  const bot = { name, room, client, done: new Set(), left: false };
  bots.push(bot);

  const say = (msg) => { if (!opts.quiet) console.log(`  ${name}: ${msg}`); };

  /** 같은 key는 한 번만 실행한다. onStateChange는 초당 여러 번 온다. */
  const act = (key, ms, label, fn) => {
    if (bot.done.has(key)) return;
    bot.done.add(key);
    setTimeout(() => {
      if (bot.left || stopping) return;
      try { fn(); say(label); } catch (e) { say(`실패 — ${e.message}`); }
    }, ms);
  };

  room.onStateChange((state) => {
    if (bot.left || stopping) return;
    const s = state.toJSON();
    const me = s.players?.[room.sessionId];
    if (!me) return;

    if (opts.check) {
      const bad = violations(s, room.sessionId);
      if (bad.length) {
        console.error(`\n✖ 불변식 위반 (${name} 관점, phase=${s.phase})`);
        for (const b of bad) console.error(`  - ${b}`);
        shutdown(1);
        return;
      }
    }

    // 관전자는 아무것도 하지 않는다. 서버가 어차피 거부한다
    if (me.isSpectator) return;

    const r = s.round;
    const others = Object.values(s.players)
      .filter((p) => !p.isSpectator && p.id !== room.sessionId);

    switch (s.phase) {
      case "waiting": {
        if (!opts.autoStart || !me.isHost) return;
        const n = Object.values(s.players).filter((p) => !p.isSpectator).length;
        if (n < MIN_PLAYERS) return;
        act(`start:${n}`, opts.delay, "게임 시작", () => room.send("start-match", {}));
        return;
      }

      case "word-check": {
        if (me.hasCheckedWord) return;
        act(`check:${r}`, opts.delay, "제시어 확인", () => room.send("check-word", {}));
        return;
      }

      case "description": {
        if (s.descriptionOrder[s.currentDescriberIndex] !== room.sessionId) return;
        const key = `desc:${r}:${s.descriptionAttempts}:${s.currentDescriberIndex}`;
        act(key, opts.delay, "설명 제출", () => {
          let text = pick(NEUTRAL);
          // 시민 봇만 힌트를 줄 수 있다. 라이어는 애초에 단어를 모른다
          if (opts.hint && me.myWord) text += ` (${[...me.myWord].length}글자)`;
          room.send("submit-description", { text });
        });
        return;
      }

      case "discussion": {
        if (me.nominatedId) return;
        const key = `nom:${r}:${s.discussionAttempts}`;
        // 지목은 조금 뜸을 들인다. 봇이 즉시 찍으면 사람이 생각할 틈이 없다
        act(key, opts.delay * 2, "지목", () => {
          const target = pick(others);
          if (target) room.send("nominate", { targetId: target.id });
        });
        return;
      }

      case "defense": {
        if (s.defendantId !== room.sessionId) return;
        // 사람이 변론을 읽을 시간을 준다. 서두르면 화면이 휙 지나간다
        act(`def:${r}`, Math.max(opts.delay * 3, 4000), "변론 종료",
          () => room.send("end-defense", {}));
        return;
      }

      case "final-vote": {
        if (s.defendantId === room.sessionId || me.hasFinalVoted) return;
        // 제한시간이 15초로 고정이다. 지연을 길게 잡으면 표가 날아간다
        act(`vote:${r}:${s.discussionAttempts}`, Math.min(opts.delay, 3000), "투표", () => {
          room.send("final-vote", { agree: rand() < 0.7 });
        });
        return;
      }

      case "liar-guess": {
        if (s.defendantId !== room.sessionId) return;
        act(`guess:${r}`, Math.min(opts.delay, 3000), "정답 제출", () => {
          // 봇은 시민 단어를 모른다. 바보 모드면 자기 단어라도 내본다
          const text = opts.guess ?? me.myWord ?? "모르겠어요";
          room.send("liar-guess", { text });
        });
        return;
      }

      case "round-result":
      case "scoreboard":
      case "match-result": {
        // 사람이 호스트면 사람이 넘긴다. 봇은 자기가 호스트일 때만 진행한다
        if (!me.isHost) return;
        act(`next:${s.phase}:${r}`, Math.max(opts.delay * 4, 5000), "다음으로",
          () => room.send("next-round", {}));
        return;
      }
    }
  });

  room.onError((code, message) => console.error(`  ${name}: 오류 ${code} ${message ?? ""}`));
  room.onLeave((code) => {
    bot.left = true;
    if (!stopping) console.log(`  ${name}: 퇴장 (code ${code})`);
  });

  return bot;
}

// ── 실행 ─────────────────────────────────────────────

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled(bots.map((b) => (b.left ? null : b.room.leave())));
  process.exit(exitCode);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const names = BOT_NAMES.slice(0, opts.n);
if (names.length < opts.n) {
  console.error(`봇은 최대 ${BOT_NAMES.length}명까지 지원한다.`);
  process.exit(1);
}

console.log(`\n▶ ${opts.url} · 봇 ${opts.n}명 · 지연 ${opts.delay}ms` +
  (opts.seed !== null ? ` · seed ${opts.seed}` : "") +
  (opts.check ? " · 불변식 검사 켜짐" : ""));

try {
  let roomId = opts.room;

  if (!roomId) {
    const first = await spawn(names[0], null);
    roomId = first.room.roomId;
    console.log(`\n  방을 만들었다 → ${roomId}`);
    console.log(`  브라우저로 들어오려면: /room/${roomId}\n`);
  }

  // 한 명씩 붙인다. 동시에 붙이면 서버가 좌석을 잡는 순서가 뒤엉킨다
  for (const name of names.slice(bots.length)) {
    await spawn(name, roomId);
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n  봇 ${bots.length}명 입장 완료. Ctrl+C 로 종료한다.\n`);
} catch (e) {
  console.error(`\n✖ 봇을 붙이지 못했다: ${e.message}`);
  console.error("  서버가 떠 있는지, --room ID가 맞는지, 정원이 남았는지 확인할 것.\n");
  await shutdown(1);
}
