import { parseSseChunk } from "./stream";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

export type StreamEvent = {
  event: string;
  data: string;
};

export type StreamHandler = (event: StreamEvent) => void;

export const startStreamingChat = async (
  prompt: string,
  signal: AbortSignal,
  onChunk: StreamHandler
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt }),
    signal
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || `Backend responded with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Streaming body is not available in this browser.");
  }

  /**
   * It’s one of the keys. response.body is a ReadableStream; 
   * calling getReader() gives us a reader that can pull chunks as they arrive. 
   * By repeatedly await reader.read() and decoding each chunk, 
   * we can process the SSE data incrementally. 
   * So yes—getReader() is how the frontend gains access to the streaming HTTP response body. 
   * Without it, we’d have to wait for the entire response before parsing.
   */
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let shouldStop = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawChunk = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (rawChunk) {
        const event = parseSseChunk(rawChunk);
        onChunk(event);
        if (event.event === "done") {
          shouldStop = true;
          break;
        }
      }
      boundary = buffer.indexOf("\n\n");
    }

    if (shouldStop) {
      break;
    }
  }
};
