import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { ClientMessage, ServerMessage } from "@syncboard/shared";
import { SERVICE_WS } from "../config.js";

export interface GenerateState {
  busy: boolean;
  cot: string;
  status: string;
  error?: string;
  lastElementId?: string;
}

export interface GenerateApi extends GenerateState {
  generate: (
    prompt: string,
    targetElementId?: string,
    prevSfc?: string,
  ) => void;
  cancel: () => void;
}

export function useGenerate(): GenerateApi {
  const [state, setState] = useState<GenerateState>({
    busy: false,
    cot: "",
    status: "",
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reqRef = useRef<string | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`${SERVICE_WS}/ws/generate`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      if (reqRef.current && "requestId" in msg && msg.requestId !== reqRef.current)
        return;

      switch (msg.type) {
        case "accepted":
          setState((s) => ({ ...s, busy: true, status: "thinking", cot: "" }));
          break;
        case "cot":
          setState((s) => ({ ...s, cot: s.cot + msg.delta }));
          break;
        case "status":
          setState((s) => ({ ...s, status: msg.status }));
          break;
        case "done":
          setState((s) => ({
            ...s,
            busy: false,
            status: "done",
            lastElementId: msg.elementId,
          }));
          reqRef.current = null;
          break;
        case "error":
          setState((s) => ({
            ...s,
            busy: false,
            status: "error",
            error: msg.message,
          }));
          reqRef.current = null;
          break;
      }
    };

    return () => ws.close();
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws) return;
    const payload = JSON.stringify(msg);
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    else ws.addEventListener("open", () => ws.send(payload), { once: true });
  }, []);

  const generate: GenerateApi["generate"] = useCallback(
    (prompt, targetElementId, prevSfc) => {
      const requestId = nanoid(8);
      reqRef.current = requestId;
      setState({ busy: true, cot: "", status: "thinking", error: undefined });
      send({ type: "generate", requestId, prompt, targetElementId, prevSfc });
    },
    [send],
  );

  const cancel: GenerateApi["cancel"] = useCallback(() => {
    if (reqRef.current) send({ type: "cancel", requestId: reqRef.current });
    setState((s) => ({ ...s, busy: false, status: "cancelled" }));
    reqRef.current = null;
  }, [send]);

  return { ...state, generate, cancel };
}
