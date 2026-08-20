import type { Delayed } from "@colyseus/timer";

/**
 * 페이즈 타이머 + 일시정지(R2).
 *
 * ⚠️ `Delayed.pause()`는 중첩 카운트를 하지 않는다. `pause()`를 두 번 호출해도
 * `resume()` 한 번이면 재개된다. 2명이 끊겼다가 1명만 복귀했는데 게임이
 * 진행되어 버리므로 **끊긴 인원 수를 직접 세야 한다.** (체크리스트 G8)
 */
export class PhaseTimer {
  private timer?: Delayed;
  private disconnected = 0;
  private totalMs = 0;

  /** 새 페이즈 타이머를 건다. 이전 타이머는 취소된다. */
  set(timer: Delayed | undefined, totalMs: number): void {
    this.clear();
    this.timer = timer;
    this.totalMs = totalMs;
    // 이미 누군가 끊겨 있다면 새 타이머도 즉시 멈춘 상태로 시작한다
    if (this.disconnected > 0) this.timer?.pause();
  }

  clear(): void {
    this.timer?.clear();
    this.timer = undefined;
    this.totalMs = 0;
  }

  /** 남은 시간(ms). 무기한 페이즈면 0. */
  remainingMs(): number {
    if (!this.timer || this.totalMs === 0) return 0;
    return Math.max(0, this.totalMs - this.timer.elapsedTime);
  }

  get paused(): boolean {
    return this.disconnected > 0;
  }

  /** 한 명이 끊겼다. 첫 번째 끊김에서만 실제로 멈춘다. */
  onDisconnect(): boolean {
    const wasRunning = this.disconnected === 0;
    this.disconnected++;
    if (wasRunning) this.timer?.pause();
    return wasRunning;
  }

  /** 한 명이 복귀했다. 전원 복귀했을 때만 재개한다. */
  onReconnect(): boolean {
    if (this.disconnected === 0) return false;
    this.disconnected--;
    const nowRunning = this.disconnected === 0;
    if (nowRunning) this.timer?.resume();
    return nowRunning;
  }

  /** 이탈이 확정되어 대기 대상에서 빠진다. */
  onGiveUp(): boolean {
    return this.onReconnect();
  }

  reset(): void {
    this.clear();
    this.disconnected = 0;
  }
}
