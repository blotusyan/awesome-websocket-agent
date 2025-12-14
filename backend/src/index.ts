import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { streamBedrockResponse } from "./bedrockClient.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const corsOrigin = process.env.CORS_ORIGIN || "*";
const allowedOrigins =
  corsOrigin === "*"
    ? undefined
    : corsOrigin
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins ?? true,
    credentials: false
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", modelId: process.env.BEDROCK_MODEL_ID || "not-set" });
});

app.post("/api/chat", async (req: Request, res: Response) => {
  const prompt = (req.body?.prompt || "").trim();
  if (!prompt) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }

  console.info(`[api] Received prompt of length ${prompt.length} characters.`);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

  let clientDisconnected = false;
  let tokensSent = 0;
  req.on("aborted", () => {
    clientDisconnected = true;
    console.warn("[api] Request aborted by the client before completion.");
  });
  req.on("error", (err) => {
    console.error("[api] Request stream error:", err);
  });
  res.on("error", (err) => {
    console.error("[api] Response stream error:", err);
  });
  res.on("finish", () => {
    console.info(`[api] Response finished after sending ${tokensSent} chunks.`);
  });
  res.on("close", () => {
    if (!clientDisconnected) {
      console.warn("[api] Response 'close' fired; marking client disconnected.");
      clientDisconnected = true;
    }
  });

  try {
    for await (const token of streamBedrockResponse(prompt)) {
      if (clientDisconnected) {
        break;
      }
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
      tokensSent += 1;
    }
    if (!clientDisconnected) {
      console.info(`[api] Completed stream with ${tokensSent} chunks sent.`);
      res.write("event: done\ndata: {}\n\n");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    console.error("[api] Error while streaming response:", error);
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
  } finally {
    if (!clientDisconnected) {
      res.end();
    }
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
