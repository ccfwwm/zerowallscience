// Chat Completions models (e.g. kimi-k3 over @ai-sdk/openai-compatible) stream
// their reasoning inline as <think>...</think> inside the assistant text rather
// than as a separate `reasoning` part the way the Responses API does. Pull those
// spans out of the prose so the thread renders them as a collapsible reasoning
// block instead of leaking raw <think> tags into the answer.

const OPEN = /<think(?:ing)?>/i;
const CLOSE = /<\/think(?:ing)?>/i;

/**
 * Split inline <think>…</think> (or <thinking>…</thinking>) spans out of a
 * markdown string. Returns the visible prose (`clean`) and the concatenated
 * reasoning text (`reasoning`, empty when there was none). An unterminated
 * <think> — common mid-stream, before the closing tag has arrived — treats the
 * remainder as reasoning so nothing flashes as answer text and then vanishes.
 */
export function splitThink(text: string): { clean: string; reasoning: string } {
  let clean = "";
  const thoughts: string[] = [];
  let rest = text;
  for (;;) {
    const open = rest.match(OPEN);
    if (!open || open.index === undefined) {
      clean += rest;
      break;
    }
    clean += rest.slice(0, open.index);
    const afterOpen = rest.slice(open.index + open[0].length);
    const close = afterOpen.match(CLOSE);
    if (!close || close.index === undefined) {
      thoughts.push(afterOpen);
      break;
    }
    thoughts.push(afterOpen.slice(0, close.index));
    rest = afterOpen.slice(close.index + close[0].length);
  }
  return { clean: clean.trim(), reasoning: thoughts.join("\n\n").trim() };
}
