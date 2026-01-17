import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { streamBedrockResponse } from "./bedrockClient.js";
import { appConfig } from "./config.js";
import { prepareSseResponse } from "./httpUtils.js";

const app = express();
/**
 * That’s nested object destructuring. 
 * It pulls port, corsOrigins, and allowAllOrigins from the server object inside appConfig.
 */
const {
  server: { port, corsOrigins, allowAllOrigins }
} = appConfig;

/**
 * express middleware setup
 * CORS middleware to handle cross-origin requests.
 * JSON body parser middleware to parse incoming JSON requests with a size limit of 1MB.
 */
app.use(
  cors({
    origin: allowAllOrigins ? true : corsOrigins,
    credentials: false
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", modelId: appConfig.bedrock.modelId });
});

app.post("/api/chat", async (req: Request, res: Response) => {
  const prompt = (req.body?.prompt || "").trim();
  if (!prompt) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }

  console.info(`[api] Received prompt of length ${prompt.length} characters.`);
  const sseContext = prepareSseResponse(req, res);

  try {
    for await (const token of streamBedrockResponse(prompt)) {
      if (sseContext.clientDisconnected) {
        break;
      }
      /**
       * Here, we’re writing each token as a separate SSE data event.
       * The format for SSE requires each event to start with "data: " followed by the data payload,
       * and end with two newline characters to signify the end of the event.
       */
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
      sseContext.tokensSent += 1;
    }
    if (!sseContext.clientDisconnected) {
      console.info(`[api] Completed stream with ${sseContext.tokensSent} chunks sent.`);
      res.write("event: done\ndata: {}\n\n");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    console.error("[api] Error while streaming response:", error);
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
  } finally {
    if (!sseContext.clientDisconnected) {
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
