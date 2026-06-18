/**
 * Wire protocol between client and service.
 * WebSocket messages for `/ws/generate` + REST DTOs.
 * Single source of truth, imported by both client and service.
 */

/** ---- WebSocket: client -> service ---- */

export interface GenerateRequest {
  type: "generate";
  /** Idempotency + response correlation. */
  requestId: string;
  /** User natural-language prompt. */
  prompt: string;
  /** Present => "modify" existing element; absent => "create" new. */
  targetElementId?: string;
  /** When modifying, the current SFC source as context (optional). */
  prevSfc?: string;
}

export interface CancelRequest {
  type: "cancel";
  requestId: string;
}

export type ClientMessage = GenerateRequest | CancelRequest;

/** ---- WebSocket: service -> client ---- */

export type GenerateStatus = "received" | "compiling" | "writing";

export interface AcceptedMessage {
  type: "accepted";
  requestId: string;
}

export interface CotMessage {
  type: "cot";
  requestId: string;
  /** Chain-of-thought streaming delta. */
  delta: string;
}

export interface StatusMessage {
  type: "status";
  requestId: string;
  status: GenerateStatus;
}

export interface DoneMessage {
  type: "done";
  requestId: string;
  elementId: string;
}

export interface ErrorMessage {
  type: "error";
  requestId: string;
  message: string;
}

export type ServerMessage =
  | AcceptedMessage
  | CotMessage
  | StatusMessage
  | DoneMessage
  | ErrorMessage;

/** ---- REST DTOs ---- */

export interface HealthResponse {
  ok: boolean;
  model: string;
}

export interface FluidInfoResponse {
  containerId: string;
  endpoint: string;
}

/** ---- helpers ---- */

export function isClientMessage(v: unknown): v is ClientMessage {
  if (typeof v !== "object" || v === null) return false;
  const t = (v as { type?: unknown }).type;
  return t === "generate" || t === "cancel";
}
