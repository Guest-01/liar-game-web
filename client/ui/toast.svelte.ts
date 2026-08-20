export type Toast = { id: number; text: string; kind: "info" | "error" | "success" };

let seq = 0;
export const toasts = $state<{ items: Toast[] }>({ items: [] });

export function toast(text: string, kind: Toast["kind"] = "info"): void {
  const t = { id: ++seq, text, kind };
  toasts.items.push(t);
  setTimeout(() => {
    const i = toasts.items.findIndex((x) => x.id === t.id);
    if (i >= 0) toasts.items.splice(i, 1);
  }, 3000);
}
