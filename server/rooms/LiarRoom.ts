import { Room, type Client } from "colyseus";
import { ArraySchema } from "@colyseus/schema";
import { nanoid } from "nanoid";
import { z } from "zod";

import {
  ALL_NOMINATED_GRACE_MS, CHAT_HISTORY, DEFAULT_DEFENSE_TIME, DEFAULT_DESCRIPTION_TIME,
  DEFAULT_DISCUSSION_TIME, DEFAULT_ROUND_COUNT, MAX_PLAYERS, MIN_PLAYERS,
  RECONNECT_GRACE_SEC, REDO_TARGET,
} from "../../shared/constants.js";
import { MESSAGE_SCHEMAS, type MessageType, CreateOptions, JoinOptions } from "../../shared/protocol.js";
import {
  canRediscuss, canStartMatch, decideAfterDiscussion, decideAfterFinalVote, decideAfterLiarGuess,
  isGuessCorrect, isMatchOver, isValidCategory, makeDescriptionOrder, pickLiar, pickWords,
  resolveCategory, scoreRound, tallyFinalVote, tallyNominations, wordFor,
} from "../../shared/rules.js";
import { IN_ROUND_PHASES, type GameMode, type Phase } from "../../shared/types.js";
import { logger } from "../logger.js";
import { assignSecrets, clearSecrets, syncViews } from "./projection.js";
import { FX_PHASES, PHASES, phaseAccepts, phaseDuration } from "./phases.js";
import { ChatSchema, PlayerSchema, RoomSchema } from "./state.js";
import { PhaseTimer } from "./timer.js";

/** 라운드 비밀. **Schema 밖에 둔다** — 유출 경로가 구조적으로 존재하지 않게. */
type RoundSecret = { liarId: string; citizenWord: string; liarWord: string };

export class LiarRoom extends Room<{ state: RoomSchema }> {
  // ⚠️ 0.17의 제네릭은 Room<{ state: S }>다. 0.16의 Room<S>가 아니다. (체크리스트 G10)

  override maxClients = MAX_PLAYERS;

  private secret: RoundSecret | null = null;
  private password: string | null = null;
  private readonly timer = new PhaseTimer();
  private nominations = new Map<string, string>();
  private finalVotes = new Map<string, boolean>();

  /** 재접속 유예 중인 세션. value는 유예 만료 시각(서버 기준)과 취소 핸들. */
  private waiting = new Map<string, { deadline: number; reject: () => void }>();

  /** 재접속 유예(초). 테스트에서 줄일 수 있도록 인스턴스 속성으로 둔다. */
  protected graceSeconds: number = RECONNECT_GRACE_SEC;

  /**
   * 연출 페이즈 길이 배율. 테스트에서 0으로 두면 연출이 즉시 통과한다.
   * 게임 규칙에는 영향이 없다 — 연출은 보여주기 위한 시간이다.
   */
  protected fxScale = 1;

  /** 직전 라운드가 무효였는가. 무효면 라운드 수를 소모하지 않는다 (REQUIREMENTS §1.7). */
  private lastRoundVoided = false;

  /** 점수 계산에 쓸 "그 라운드의 마지막 지목". 토론이 재시작돼도 마지막 것만 남는다. */
  private lastNominations = new Map<string, string>();

  // ───────────────────────────────────────────────────────────
  // 생명주기
  // ───────────────────────────────────────────────────────────

  override onCreate(options: unknown): void {
    const parsed = CreateOptions.safeParse(options);
    if (!parsed.success) throw new Error("방 생성 옵션이 올바르지 않다");
    const opts = parsed.data;

    this.state = new RoomSchema();
    this.state.name = opts.roomName;
    this.state.isPublic = opts.isPublic;
    this.state.maxPlayers = MAX_PLAYERS;
    this.state.totalRounds = DEFAULT_ROUND_COUNT;
    this.state.descriptionTime = DEFAULT_DESCRIPTION_TIME;
    this.state.discussionTime = DEFAULT_DISCUSSION_TIME;
    this.state.defenseTime = DEFAULT_DEFENSE_TIME;
    this.password = opts.isPublic ? null : (opts.password ?? null);

    this.syncMetadata();
    this.registerMessages();
    this.enterPhase("waiting");
  }

  override onAuth(_client: Client, options: unknown): boolean {
    const parsed = JoinOptions.safeParse(options);
    if (!parsed.success) throw new Error("닉네임은 2~10자여야 합니다.");
    if (this.password && parsed.data.password !== this.password) {
      throw new Error("비밀번호가 틀렸습니다.");
    }
    const nick = parsed.data.nickname;
    for (const p of this.state.players.values()) {
      if (p.nickname !== nick) continue;
      // 유예 중인 자리와의 충돌은 십중팔구 토큰을 잃은 본인이다 (브라우저를 닫았다
      // 다시 연 경우). 유예가 끝나면 들어올 수 있다는 것을 알려준다.
      throw new Error(
        p.isConnected
          ? "이미 같은 닉네임이 사용 중입니다."
          : "같은 닉네임이 재접속을 기다리는 중입니다. 잠시 후 다시 시도하세요.",
      );
    }
    // 라운드 중이면 관전자로 받는다.
    // ★ 불변식: 플레이어 + 관전자 ≤ 최대 인원 (D11)
    //   이 덕분에 다음 라운드에서 관전자를 전원 승격시켜도 정원을 넘지 않는다.
    if (this.occupancy() >= this.state.maxPlayers) {
      throw new Error(
        IN_ROUND_PHASES.has(this.state.phase as Phase)
          ? "관전 자리가 없습니다."
          : "방이 가득 찼습니다.",
      );
    }
    return true;
  }

  override onJoin(client: Client, options: unknown): void {
    const { nickname } = JoinOptions.parse(options);
    const p = new PlayerSchema();
    p.id = client.sessionId;      // ★ 플레이어 정체성은 sessionId다. socket이 아니다.
    p.nickname = nickname;
    p.isSpectator = IN_ROUND_PHASES.has(this.state.phase as Phase);
    // 관전자는 호스트가 될 수 없다
    p.isHost = !p.isSpectator && this.playerCount() === 0;
    this.state.players.set(client.sessionId, p);

    this.system(
      p.isSpectator
        ? `${nickname}님이 관전을 시작했습니다`
        : `${nickname}님이 입장했습니다`,
    );
    this.refresh();
    logger.info({ roomId: this.roomId, nickname }, "입장");
  }

  override async onLeave(client: Client, code: number): Promise<void> {
    // ⚠️ 0.17에서 두 번째 인자는 boolean(consented)이 아니라 close code다.
    //    4000이 정상 퇴장. `if (consented)`로 쓰면 컴파일은 되고 재접속이 영영 안 된다.
    //    (체크리스트 G1)
    const consented = code === 4000;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;

    // 관전자는 게임 진행에 필요하지 않으므로 유예를 주지 않는다.
    // 관전자 때문에 게임이 멈추면 안 된다.
    if (consented || p.isSpectator) {
      this.system(`${p.nickname}님이 나갔습니다`);
      this.confirmDeparture(client.sessionId);
      return;
    }

    // ── 유예 시작 ────────────────────────────────────
    p.isConnected = false;
    const deferred = this.allowReconnection(client, this.graceSeconds);
    this.waiting.set(client.sessionId, {
      deadline: Date.now() + this.graceSeconds * 1000,
      reject: () => deferred.reject(),
    });
    this.timer.onDisconnect();
    this.system(`${p.nickname}님의 접속이 끊겼습니다 — 재접속을 기다립니다`);
    this.refresh();
    logger.info({ roomId: this.roomId, nickname: p.nickname }, "유예 시작");

    try {
      await deferred;
      // ── 복귀 ───────────────────────────────────────
      this.waiting.delete(client.sessionId);
      const back = this.state.players.get(client.sessionId);
      if (back) back.isConnected = true;
      this.timer.onReconnect();
      this.system(`${p.nickname}님이 돌아왔습니다`);
      this.refresh();
      logger.info({ roomId: this.roomId, nickname: p.nickname }, "재접속 성공");
    } catch {
      // ── 유예 만료 또는 호스트가 건너뜀 ──────────────
      this.waiting.delete(client.sessionId);
      this.timer.onGiveUp();
      this.system(`${p.nickname}님이 나갔습니다`);
      this.confirmDeparture(client.sessionId);
      logger.info({ roomId: this.roomId, nickname: p.nickname }, "이탈 확정");
    }
  }

  /** 호스트가 재접속 대기를 건너뛴다. 유예 중인 전원을 즉시 이탈 처리한다. */
  private skipWait(): void {
    if (this.waiting.size === 0) return;
    for (const { reject } of [...this.waiting.values()]) reject();
  }

  /**
   * 이탈이 **확정된** 뒤의 처리. 유예 만료 시점 기준으로 판정한다.
   * 라이어 이탈은 단계별로 다르게 처리한다 (REQUIREMENTS §F8 R3 / D2).
   */
  private confirmDeparture(sessionId: string): void {
    const p = this.state.players.get(sessionId);
    const wasHost = p?.isHost ?? false;
    const wasLiar = this.secret?.liarId === sessionId;
    const wasDefendant = this.state.defendantId === sessionId;

    this.state.players.delete(sessionId);
    this.nominations.delete(sessionId);
    this.finalVotes.delete(sessionId);

    if (wasHost) this.reassignHost();
    if (this.state.players.size === 0) return;

    if (IN_ROUND_PHASES.has(this.state.phase as Phase)) {
      // ① 이미 결과가 확정된 경우가 최우선이다.
      //    라이어가 피고로 확정된 뒤 나갔다면 시민이 이긴 것이고, 그 뒤에
      //    인원이 줄었다고 해서 승리를 무효로 돌리면 "불리해지면 나가서
      //    무효화" 악용이 그대로 살아난다 (D2).
      if (wasLiar && this.state.defendantId !== "") {
        this.system("지목된 라이어가 나갔습니다");
        this.endRound("citizen", "liar-executed-wrong-guess");
        return;
      }
      //    같은 원칙이 시민 피고에게도 적용된다. 처형이 확정된 뒤(개표 연출 중)
      //    피고가 나가면 이미 라이어가 이긴 것이다. 여기서 "피고 이탈 → 재토론"으로
      //    흘러가면 시민 쪽이 나가서 패배를 무효화할 수 있다.
      if (wasDefendant && this.state.executionConfirmed) {
        this.system("처형된 시민이 나갔습니다");
        this.endRound("liar", "citizen-executed");
        return;
      }
      // ② 인원 미달 — 아래 어떤 복구도 불가능하다
      if (this.playerCount() < MIN_PLAYERS) {
        this.voidRound("인원이 부족해 라운드를 중단합니다");
        return;
      }
      // ③ 라이어 이탈 (아직 결과 미확정)
      if (wasLiar) { this.handleLiarDeparture(); return; }
      // ④ 피고 이탈
      if (wasDefendant) { this.handleDefendantDeparture(); return; }
      this.reconcileAfterLeave();
    }
    this.refresh();
  }

  /**
   * 라이어가 **결과 확정 전에** 이탈했을 때 (D2).
   * 피고 확정 후는 confirmDeparture가 먼저 처리한다.
   */
  private handleLiarDeparture(): void {
    if (this.state.phase === "word-check") {
      // 아직 정보가 게임에 반영되지 않았다 → 깨끗하게 되감는다.
      // 라운드 수를 소모하지 않는다.
      this.system("라이어가 나가 라운드를 다시 시작합니다");
      this.startRound(false);
      return;
    }
    // 설명~지목 중: 아직 시민이 이긴 것이 아니므로 공짜 점수를 주지 않는다
    this.voidRound("라이어가 나가 라운드를 무효 처리합니다");
  }

  /** 피고(라이어가 아닌)가 이탈했을 때: 기회가 남으면 재토론. */
  private handleDefendantDeparture(): void {
    const attempts = {
      description: this.state.descriptionAttempts,
      discussion: this.state.discussionAttempts,
    };
    if (canRediscuss(attempts)) {
      this.system("피고가 나가 토론을 재개합니다");
      this.startDiscussion();
    } else {
      this.endRound("liar", "chances-exhausted");
    }
  }

  override onDispose(): void {
    this.timer.reset();
    this.waiting.clear();
  }

  // ───────────────────────────────────────────────────────────
  // 메시지 디스패치 — 검증·권한·페이즈 검사를 한 곳에서
  // ───────────────────────────────────────────────────────────

  private registerMessages(): void {
    for (const type of Object.keys(MESSAGE_SCHEMAS) as MessageType[]) {
      this.onMessage(type, (client, payload) => {
        // skip-wait는 유예 중 어느 페이즈에서든 허용된다
        if (type !== "skip-wait" && !phaseAccepts(this.state.phase, type)) return;

        const schema = MESSAGE_SCHEMAS[type] as z.ZodType;
        const parsed = schema.safeParse(payload ?? {});
        if (!parsed.success) return;

        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        // 관전자는 읽기 전용이다. 훈수로 게임에 개입하는 것을 막는다 (D3).
        if (player.isSpectator) return;

        try {
          this.handle(type, client, player, parsed.data);
        } catch (err) {
          logger.error({ err, type, roomId: this.roomId }, "메시지 처리 실패");
        }
      });
    }
  }

  private handle(type: MessageType, client: Client, player: PlayerSchema, data: unknown): void {
    const hostOnly = () => player.isHost;

    switch (type) {
      case "set-settings":
        if (hostOnly()) this.applySettings(data as Record<string, unknown>);
        break;
      case "kick":
        if (hostOnly()) this.kick((data as { targetId: string }).targetId, client.sessionId);
        break;
      case "start-match":
        if (hostOnly() && canStartMatch(this.playerCount())) {
          this.state.round = 0;
          for (const p of this.players()) { p.score = 0; p.roundDelta = 0; }
          this.lastRoundVoided = false;
          this.startRound();
        }
        break;
      case "check-word":
        this.checkWord(player);
        break;
      case "submit-description":
        this.submitDescription(player, (data as { text: string }).text);
        break;
      case "nominate":
        this.nominate(player, (data as { targetId: string }).targetId);
        break;
      case "chat":
        this.chat(player, (data as { text: string }).text);
        break;
      case "end-defense":
        if (this.state.defendantId === player.id) this.enterPhase("final-vote");
        break;
      case "final-vote":
        this.finalVote(player, (data as { agree: boolean }).agree);
        break;
      case "liar-guess":
        this.liarGuess(player, (data as { text: string }).text);
        break;
      case "next-round":
        if (hostOnly()) this.advanceMatch();
        break;
      case "skip-wait":
        if (hostOnly()) this.skipWait();
        break;
    }
  }

  // ───────────────────────────────────────────────────────────
  // 페이즈 전이 — 모든 전이가 이 함수 하나를 통과한다
  // ───────────────────────────────────────────────────────────

  private enterPhase(next: Phase): void {
    this.timer.clear();
    this.state.phase = next;
    this.onEnter(next);

    const base = phaseDuration(next, this.state);
    const ms = FX_PHASES.has(next) ? Math.round(base * this.fxScale) : base;
    if (ms > 0) {
      const delayed = this.clock.setTimeout(() => this.onTimeout(next), ms);
      this.timer.set(delayed, ms);
      this.state.phaseEndsAt = ms;
    } else if (PHASES[next].duration !== null) {
      // duration 0 (M1의 연출 페이즈) — 즉시 통과시킨다
      this.state.phaseEndsAt = 0;
      this.clock.setTimeout(() => this.onTimeout(next), 1);
    } else {
      this.state.phaseEndsAt = 0;
    }

    this.refresh();
  }

  private onEnter(phase: Phase): void {
    switch (phase) {
      // "description"은 라운드당 한 번이 아니라 **사람당 한 번** 진입한다.
      // 순서/설명 초기화는 라운드 단위 작업이므로 beginDescriptionRound()에 있다.
      case "discussion":
        this.nominations.clear();
        for (const p of this.players()) p.nominatedId = "";
        this.state.defendantId = "";
        break;
      case "final-vote":
        this.finalVotes.clear();
        for (const p of this.players()) { p.hasFinalVoted = false; p.myFinalVote = false; }
        this.state.agreeCount = this.state.disagreeCount = this.state.abstainCount = 0;
        this.state.executionConfirmed = false;
        this.state.defendantWasLiar = false;
        break;
    }
  }

  private onTimeout(phase: Phase): void {
    if (this.state.phase !== phase) return;   // 이미 다른 곳으로 전이됨

    switch (phase) {
      case "order-reveal":      return this.enterPhase("description");
      case "description":       return this.autoSubmitDescription();
      case "description-reveal": return this.advanceDescriber();
      case "discussion":        return this.closeDiscussion();
      case "defense":           return this.enterPhase("final-vote");
      case "final-vote":        return this.closeFinalVote();
      case "vote-reveal":       return this.afterVoteReveal();
      case "liar-guess":        return this.resolveLiarGuess("");
    }
  }

  /** 로비 목록(`/api/rooms`)이 읽는 메타데이터를 상태와 맞춘다. */
  private syncMetadata(): void {
    const s = this.state;
    this.setMetadata({
      name: s.name,
      isPublic: s.isPublic,
      gameMode: s.gameMode,
      category: s.category,
      maxPlayers: s.maxPlayers,
      inProgress: IN_ROUND_PHASES.has(s.phase as Phase),
      occupancy: this.occupancy(),
    });
  }

  /** 상태에 파생 필드를 반영하고 뷰를 다시 계산한다. */
  private refresh(): void {
    this.state.phaseRemainingMs = this.timer.remainingMs();
    this.state.isPaused = this.timer.paused;
    // 유예가 모두 끝나기까지 남은 시간. 클라이언트는 수신 시각 기준으로 센다.
    let latest = 0;
    for (const w of this.waiting.values()) latest = Math.max(latest, w.deadline - Date.now());
    this.state.graceRemainingMs = Math.max(0, latest);
    this.syncMetadata();
    syncViews(this.clients, this.state);
  }

  // ───────────────────────────────────────────────────────────
  // 라운드 흐름
  // ───────────────────────────────────────────────────────────

  private startRound(advanceRound = true): void {
    this.promoteSpectators();     // 다음 라운드부터 참여한다 (F7)
    const ids = this.players().map((p) => p.id);
    const category = resolveCategory(this.state.category);
    const words = pickWords(category);
    const liarId = pickLiar(ids);

    this.state.category = category;
    if (advanceRound) this.state.round += 1;
    this.state.descriptionAttempts = 0;
    this.state.discussionAttempts = 0;
    this.lastNominations.clear();
    this.state.descriptionOrder = new ArraySchema<string>(...makeDescriptionOrder(ids));
    this.clearRoundResult();

    this.secret = { liarId, citizenWord: words.citizen, liarWord: words.liar };
    const mode = this.state.gameMode as GameMode;
    assignSecrets(this.players(), (id) => wordFor(id, liarId, mode, words));

    for (const p of this.players()) {
      p.hasCheckedWord = false;
      p.description = "";
      p.nominatedId = "";
      p.hasFinalVoted = false;
    }

    this.system(`라운드 ${this.state.round} 시작 — 주제: ${category}`);
    this.enterPhase("word-check");
    logger.info({ roomId: this.roomId, round: this.state.round, category }, "라운드 시작");
  }

  private checkWord(player: PlayerSchema): void {
    if (player.hasCheckedWord) return;
    player.hasCheckedWord = true;
    if (this.players().every((p) => p.hasCheckedWord)) {
      this.state.descriptionAttempts = 1;
      this.beginDescriptionRound(false);
    } else {
      this.refresh();
    }
  }

  private currentDescriberId(): string | undefined {
    return this.state.descriptionOrder[this.state.currentDescriberIndex];
  }

  private submitDescription(player: PlayerSchema, text: string): void {
    if (this.currentDescriberId() !== player.id) return;
    // 검증은 저장 시, 이스케이프는 렌더 시. HTML 엔티티 인코딩을 하지 않는다. (체크리스트 C3)
    player.description = text.trim() || "...";
    this.enterPhase("description-reveal");
  }

  private autoSubmitDescription(): void {
    const id = this.currentDescriberId();
    const p = id ? this.state.players.get(id) : undefined;
    if (p) p.description = "...";
    this.enterPhase("description-reveal");
  }

  private advanceDescriber(): void {
    this.state.currentDescriberIndex += 1;
    if (this.state.currentDescriberIndex >= this.state.descriptionOrder.length) {
      this.startDiscussion();
    } else {
      this.enterPhase("description");
    }
  }

  private startDiscussion(): void {
    this.state.discussionAttempts += 1;
    this.enterPhase("discussion");
  }

  private restartDescription(): void {
    this.state.descriptionAttempts += 1;
    this.beginDescriptionRound(true);
  }

  /**
   * 설명 **라운드**를 시작한다 (첫 진입 또는 재시작).
   * 차례를 넘기는 것과 구분해야 한다 — 차례 전환은 advanceDescriber()다.
   */
  private beginDescriptionRound(reshuffle: boolean): void {
    if (reshuffle) {
      this.state.descriptionOrder = new ArraySchema<string>(
        ...makeDescriptionOrder(this.players().map((p) => p.id)),
      );
    }
    this.state.currentDescriberIndex = 0;
    for (const p of this.players()) p.description = "";
    this.enterPhase("order-reveal");   // ⟨연출⟩ 순서 추첨 후 설명으로
  }

  private nominate(player: PlayerSchema, targetId: string): void {
    if (targetId === player.id) return;                       // 자기 자신 지목 불가
    const redoAllowed = this.state.descriptionAttempts < 2;
    if (targetId === REDO_TARGET) {
      if (!redoAllowed) return;                               // 기회 소진 시 선택지 없음
    } else {
      // 지목 대상은 **플레이어**여야 한다. 관전자는 `players` 맵에 같이 있으므로
      // 존재 여부만 보면 통과한다. 관전자가 피고가 되면 변론을 할 수 없다.
      const target = this.state.players.get(targetId);
      if (!target || target.isSpectator) return;
    }

    player.nominatedId = targetId;
    this.nominations.set(player.id, targetId);
    this.maybeCloseDiscussionEarly();
    this.refresh();
  }

  /** 전원이 지목했으면 토론을 곧 끝낸다. 지목 시와 이탈 확정 시 양쪽에서 부른다. */
  private maybeCloseDiscussionEarly(): void {
    if (this.state.phase !== "discussion") return;
    if (!this.players().every((p) => p.nominatedId !== "")) return;
    const remaining = this.timer.remainingMs();
    if (remaining > ALL_NOMINATED_GRACE_MS) {
      this.timer.clear();
      const d = this.clock.setTimeout(() => this.closeDiscussion(), ALL_NOMINATED_GRACE_MS);
      this.timer.set(d, ALL_NOMINATED_GRACE_MS);
      this.system("전원 지목 완료 — 곧 토론이 종료됩니다");
    }
  }

  private closeDiscussion(): void {
    // 점수의 "정확 지목 보너스"는 그 라운드의 마지막 지목 기준이다
    this.lastNominations = new Map(this.nominations);
    const attempts = {
      description: this.state.descriptionAttempts,
      discussion: this.state.discussionAttempts,
    };
    const next = decideAfterDiscussion(tallyNominations(this.nominations), attempts);

    switch (next.phase) {
      case "description":
        this.system("지목이 성립하지 않아 한줄 설명부터 다시 합니다");
        return this.restartDescription();
      case "discussion":
        this.system("동점입니다. 다시 토론합니다");
        return this.startDiscussion();
      case "defense":
        this.state.defendantId = next.defendantId!;
        return this.enterPhase("defense");
      case "round-result":
        return this.endRound(next.winner, next.reason);
    }
  }

  private finalVote(player: PlayerSchema, agree: boolean): void {
    if (player.id === this.state.defendantId) return;         // 피고는 투표 불가
    this.finalVotes.set(player.id, agree);
    player.hasFinalVoted = true;
    player.myFinalVote = agree;                                // 본인에게만 보인다

    if (this.eligibleVoters().every((p) => p.hasFinalVoted)) this.closeFinalVote();
    else this.refresh();
  }

  private eligibleVoters(): PlayerSchema[] {
    return this.players().filter((p) => p.id !== this.state.defendantId);
  }

  private closeFinalVote(): void {
    const r = tallyFinalVote(this.finalVotes, this.eligibleVoters().length);
    this.state.agreeCount = r.agree;
    this.state.disagreeCount = r.disagree;
    this.state.abstainCount = r.abstain;
    this.state.executionConfirmed = r.confirmed;
    // ★ 처형이 확정됐을 때만 라이어 여부를 공개한다.
    //   미확정이면 라운드가 계속되므로 채우면 정체가 샌다.
    this.state.defendantWasLiar = r.confirmed && this.state.defendantId === this.secret?.liarId;
    this.enterPhase("vote-reveal");
  }

  private afterVoteReveal(): void {
    const confirmed = this.state.executionConfirmed;
    const defendantIsLiar = this.state.defendantId === this.secret?.liarId;
    const attempts = {
      description: this.state.descriptionAttempts,
      discussion: this.state.discussionAttempts,
    };
    const next = decideAfterFinalVote(confirmed, defendantIsLiar, attempts);

    if (next.phase === "liar-guess") return this.enterPhase("liar-guess");
    if (next.phase === "discussion") {
      this.system("과반 동의를 얻지 못해 토론을 재개합니다");
      return this.startDiscussion();
    }
    if (next.phase === "round-result") return this.endRound(next.winner, next.reason);
  }

  private liarGuess(player: PlayerSchema, text: string): void {
    if (player.id !== this.secret?.liarId) return;
    this.resolveLiarGuess(text);
  }

  private resolveLiarGuess(text: string): void {
    if (!this.secret) return;
    this.state.liarGuess = text.trim();
    const next = decideAfterLiarGuess(isGuessCorrect(text, this.secret.citizenWord));
    if (next.phase === "round-result") this.endRound(next.winner, next.reason);
  }

  private endRound(winner: "citizen" | "liar", reason: string): void {
    const liarId = this.secret?.liarId ?? "";
    if (this.secret) {
      // ★ 라이어 정체와 제시어가 state에 들어가는 유일한 시점 ★
      this.state.revealedLiarId = this.secret.liarId;
      this.state.revealedCitizenWord = this.secret.citizenWord;
      this.state.revealedLiarWord = this.state.gameMode === "fool" ? this.secret.liarWord : "";
    }
    this.state.roundWinner = winner;
    this.state.roundEndReason = reason;
    this.secret = null;
    this.lastRoundVoided = false;
    this.applyScores(winner, liarId);
    this.enterPhase("round-result");
    logger.info({ roomId: this.roomId, winner, reason }, "라운드 종료");
  }

  /** 라운드 점수를 누적한다. 무효 라운드는 winner=null로 넘겨 전원 0이 된다. */
  private applyScores(winner: "citizen" | "liar" | null, liarId: string): void {
    const players = this.players();
    const delta = scoreRound({
      winner,
      liarId,
      playerIds: players.map((p) => p.id),
      nominations: this.lastNominations,
    });
    for (const p of players) {
      p.roundDelta = delta.get(p.id) ?? 0;
      p.score += p.roundDelta;
    }
  }

  private voidRound(message: string): void {
    this.system(message);
    if (this.secret) {
      this.state.revealedLiarId = this.secret.liarId;
      this.state.revealedCitizenWord = this.secret.citizenWord;
      this.state.revealedLiarWord = this.state.gameMode === "fool" ? this.secret.liarWord : "";
    }
    this.state.roundWinner = "";
    this.state.roundEndReason = "voided";
    this.secret = null;
    this.lastRoundVoided = true;      // 라운드 수를 소모하지 않는다
    this.applyScores(null, "");        // 전원 0 (roundDelta도 0으로 초기화된다)
    this.enterPhase("round-result");
  }

  /**
   * 호스트가 "다음"을 눌렀을 때의 매치 흐름.
   *
   *   round-result → scoreboard → 다음 라운드 | match-result → waiting
   */
  private advanceMatch(): void {
    switch (this.state.phase) {
      case "round-result":
        this.promoteSpectators();          // 점수판에 이미 참가자로 보인다
        this.enterPhase("scoreboard");
        return;

      case "scoreboard":
        if (this.lastRoundVoided) {
          // 무효 라운드는 라운드 수를 소모하지 않는다 — 같은 번호로 다시
          this.startRound(false);
          return;
        }
        if (isMatchOver(this.state.round, this.state.totalRounds)) {
          this.enterPhase("match-result");
          return;
        }
        this.startRound(true);
        return;

      case "match-result":
        this.backToLobby();
        return;
    }
  }

  /** 매치를 끝내고 대기실로. 점수를 초기화한다. */
  private backToLobby(): void {
    this.promoteSpectators();
    clearSecrets(this.players());
    this.clearRoundResult();
    this.state.round = 0;
    this.state.descriptionOrder = new ArraySchema<string>();
    this.state.currentDescriberIndex = 0;
    this.state.defendantId = "";
    this.nominations.clear();
    this.finalVotes.clear();
    for (const p of this.players()) {
      p.hasCheckedWord = false; p.description = ""; p.nominatedId = ""; p.hasFinalVoted = false;
      p.score = 0; p.roundDelta = 0;
    }
    this.lastRoundVoided = false;
    this.lastNominations.clear();
    this.enterPhase("waiting");
  }

  private clearRoundResult(): void {
    this.state.revealedLiarId = "";
    this.state.revealedCitizenWord = "";
    this.state.revealedLiarWord = "";
    this.state.liarGuess = "";
    this.state.roundWinner = "";
    this.state.roundEndReason = "";
  }

  /**
   * 이탈 확정 뒤, 나간 사람 때문에 페이즈가 멈춰 있지 않게 한다.
   *
   * "전원 완료" 조건은 메시지가 올 때만 평가된다. 마지막 미완료자가 나가면
   * 남은 전원은 이미 완료했는데 아무 메시지도 오지 않아 영원히 멈춘다.
   * 타이머가 있는 페이즈는 만료로 복구되지만 **제시어 확인은 무기한**이다.
   */
  private reconcileAfterLeave(): void {
    switch (this.state.phase) {
      case "word-check":
        if (this.players().every((p) => p.hasCheckedWord)) {
          this.state.descriptionAttempts = 1;
          this.beginDescriptionRound(false);
        }
        return;

      case "description":
      case "description-reveal": {
        // 순서 배열과 인덱스가 어긋나는 것을 바로잡는다. (체크리스트 A3)
        const alive = this.state.descriptionOrder.filter((id) => this.state.players.has(id));
        if (alive.length !== this.state.descriptionOrder.length) {
          this.state.descriptionOrder = new ArraySchema<string>(...alive);
          if (this.state.currentDescriberIndex > this.state.descriptionOrder.length) {
            this.state.currentDescriberIndex = this.state.descriptionOrder.length;
          }
        }
        if (this.state.phase === "description" && !this.currentDescriberId()) {
          this.startDiscussion();
        }
        return;
      }

      case "discussion":
        this.maybeCloseDiscussionEarly();
        return;

      case "final-vote":
        if (this.eligibleVoters().every((p) => p.hasFinalVoted)) this.closeFinalVote();
        return;
    }
  }

  // ───────────────────────────────────────────────────────────
  // 대기실
  // ───────────────────────────────────────────────────────────

  private applySettings(data: Record<string, unknown>): void {
    const s = this.state;
    if (typeof data.gameMode === "string") s.gameMode = data.gameMode;
    if (typeof data.category === "string" && isValidCategory(data.category)) s.category = data.category;
    if (typeof data.maxPlayers === "number" && data.maxPlayers >= this.playerCount()) {
      s.maxPlayers = data.maxPlayers;
    }
    if (typeof data.totalRounds === "number") s.totalRounds = data.totalRounds;
    if (typeof data.descriptionTime === "number") s.descriptionTime = data.descriptionTime;
    if (typeof data.discussionTime === "number") s.discussionTime = data.discussionTime;
    if (typeof data.defenseTime === "number") s.defenseTime = data.defenseTime;
    this.syncMetadata();
    this.refresh();
  }

  private kick(targetId: string, byId: string): void {
    if (targetId === byId) return;
    const p = this.state.players.get(targetId);
    if (!p) return;
    // 라운드 진행 중에는 관전자만 강퇴할 수 있다.
    // 플레이어를 빼면 라운드가 깨진다.
    if (IN_ROUND_PHASES.has(this.state.phase as Phase) && !p.isSpectator) return;
    // 유예 중인 사람은 `this.clients`에 없다. 재접속 대기를 거절하면
    // onLeave의 catch 분기가 이탈 확정을 처리한다.
    const waiting = this.waiting.get(targetId);
    if (waiting) { waiting.reject(); return; }
    this.clients.find((c) => c.sessionId === targetId)?.leave(4000);
  }

  /**
   * 호스트를 넘긴다. **접속 중인** 사람을 우선한다.
   * 유예 중인 사람이 호스트가 되면 "기다리지 않고 계속"이나 "다음 라운드"를
   * 누를 사람이 없어 그가 돌아오거나 이탈 확정될 때까지 전원이 멈춘다.
   */
  private reassignHost(): void {
    const candidates = this.players();
    const next = candidates.find((p) => p.isConnected) ?? candidates[0];
    if (next) {
      next.isHost = true;
      this.system(`${next.nickname}님이 새 호스트가 되었습니다`);
    }
  }

  private chat(player: PlayerSchema, text: string): void {
    // 최후 변론 중에는 피고만 발언할 수 있다
    if (this.state.phase === "defense" && this.state.defendantId !== player.id) return;
    this.pushChat(player.id, player.nickname, text);
  }

  private system(text: string): void {
    this.pushChat("", "", text);
  }

  private pushChat(senderId: string, nickname: string, text: string): void {
    const m = new ChatSchema();
    m.id = nanoid(8);
    m.senderId = senderId;
    m.nickname = nickname;
    m.text = text;
    m.at = Date.now();
    this.state.chat.push(m);
    while (this.state.chat.length > CHAT_HISTORY) this.state.chat.shift();
  }

  // ───────────────────────────────────────────────────────────
  private players(): PlayerSchema[] {
    return [...this.state.players.values()].filter((p) => !p.isSpectator);
  }
  private spectators(): PlayerSchema[] {
    return [...this.state.players.values()].filter((p) => p.isSpectator);
  }
  private playerCount(): number {
    return this.players().length;
  }
  /** 플레이어 + 관전자. 정원 불변식(D11)의 기준이다. */
  private occupancy(): number {
    return this.state.players.size;
  }

  /**
   * 관전자를 전원 플레이어로 승격시킨다.
   *
   * 불변식(플레이어 + 관전자 ≤ 최대 인원) 덕분에 정원 검사가 필요 없다 —
   * 승격 후에도 반드시 정원 안이다.
   */
  private promoteSpectators(): void {
    const promoted = this.spectators();
    if (promoted.length === 0) return;
    for (const p of promoted) {
      p.isSpectator = false;
      p.score = 0;               // 도중 합류자는 0점부터 (REQUIREMENTS §1.7)
      p.hasCheckedWord = false;
      p.description = "";
      p.nominatedId = "";
      p.hasFinalVoted = false;
    }
    if (!this.players().some((p) => p.isHost)) this.reassignHost();
    this.system(`${promoted.map((p) => p.nickname).join(", ")}님이 참가자가 되었습니다`);
  }
}
