export function rawMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    const json = JSON.stringify(e);
    if (json !== undefined && json !== "{}") return json;
  } catch { /* fall through to String() */ }
  const str = String(e);
  return str === "[object Object]" ? "[unknown error]" : str;
}

function friendly(msg: string): string {
  if (msg.includes("Connection refused")
      || msg.includes("error trying to connect")
      || msg.includes("os error 61")
      || msg.includes("tcp connect error")
      || (msg.includes("error sending request") && msg.includes("localhost:11434"))) {
    return "Ollama is not running. Start Ollama and try again.";
  }
  return msg;
}

export function formatIpcError(e: unknown): string {
  return friendly(rawMessage(e));
}
