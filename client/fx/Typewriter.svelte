<script lang="ts">
  /**
   * 텍스트를 한 글자씩 찍어낸다.
   *
   * 서버는 페이즈와 남은 시간만 준다 — 타임라인은 클라이언트가 소유한다.
   * v1이 손으로 짠 setInterval 체인을 대체한다.
   */
  let {
    text = "",
    msPerChar = 100,
    startDelay = 0,
    cursor = true,
    onDone,
  }: {
    text?: string;
    msPerChar?: number;
    startDelay?: number;
    cursor?: boolean;
    onDone?: () => void;
  } = $props();

  let shown = $state("");

  $effect(() => {
    const full = text;
    shown = "";
    if (!full) { onDone?.(); return; }

    let i = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const begin = setTimeout(() => {
      timer = setInterval(() => {
        i += 1;
        shown = full.slice(0, i);
        if (i >= full.length) {
          if (timer) clearInterval(timer);
          timer = null;
          onDone?.();
        }
      }, msPerChar);
    }, startDelay);

    return () => { clearTimeout(begin); if (timer) clearInterval(timer); };
  });

  const typing = $derived(shown.length < text.length);
</script>

<span class:typing-text={cursor && typing}>{shown}</span>
