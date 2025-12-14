import type { Request, Response } from "express";

export type SseContext = {
  clientDisconnected: boolean;
  tokensSent: number;
};

/**
 * Configures an Express response to emit Server-Sent Events and wires up
 * lifecycle listeners so callers can detect when the client disconnects.
 */
export const prepareSseResponse = (req: Request, res: Response): SseContext => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

  const context: SseContext = {
    clientDisconnected: false,
    tokensSent: 0
  };

  req.on("aborted", () => {
    context.clientDisconnected = true;
  });
  req.on("error", () => {
    context.clientDisconnected = true;
  });
  res.on("error", () => {
    context.clientDisconnected = true;
  });
  res.on("close", () => {
    context.clientDisconnected = true;
  });

  return context;
};
