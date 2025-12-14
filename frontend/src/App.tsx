import { FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { parseSseChunk } from "./lib/stream";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

const App = () => {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("Give me a prompt and I will respond here.");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortedByUserRef = useRef(false);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortedByUserRef.current = true;
      abortControllerRef.current.abort();
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) {
      setError("Please enter a prompt.");
      return;
    }
    if (isStreaming) {
      return;
    }

    setIsStreaming(true);
    setResponse("");
    setError(null);
    abortedByUserRef.current = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt }),
        signal: controller.signal
      });

      if (!res.ok) {
        const details = await res.text();
        throw new Error(details || `Backend responded with status ${res.status}`);
      }

      if (!res.body) {
        throw new Error("Streaming body is not available in this browser.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let isDone = false;

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
            const parsed = parseSseChunk(rawChunk);
            if (parsed.event === "message" && parsed.data) {
              const payload = JSON.parse(parsed.data) as { token?: string };
              if (payload.token) {
                setResponse((prev) => prev + payload.token);
              }
            } else if (parsed.event === "error") {
              const payload = JSON.parse(parsed.data) as { message?: string };
              throw new Error(payload.message ?? "Bedrock reported an error");
            } else if (parsed.event === "done") {
              isDone = true;
            }
          }
          boundary = buffer.indexOf("\n\n");
        }

        if (isDone) {
          break;
        }
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        if (abortedByUserRef.current) {
          setError("Streaming cancelled");
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unexpected error while streaming the response.");
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const helperText = useMemo(() => {
    if (error) {
      return error;
    }
    if (isStreaming) {
      return "Streaming response from Anthropic via Bedrock...";
    }
    return "Idle";
  }, [error, isStreaming]);

  return (
    <div className="app-shell">
      <div className="panel">
        <h1>Anthropic on Bedrock</h1>
        <p className="subtitle">
          Send a message, and the backend will relay it to AWS Bedrock and stream the Anthropic foundation model response token by token.
        </p>
        <form onSubmit={handleSubmit}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="e.g. Summarize the latest sustainability headline"
            disabled={isStreaming}
          />
          <div className="actions">
            <button className="primary" type="submit" disabled={isStreaming}>
              {isStreaming ? "Sending" : "Ask Bedrock"}
            </button>
            {isStreaming && (
              <button type="button" className="secondary" onClick={handleStop}>
                Stop
              </button>
            )}
          </div>
        </form>
        <div className={`response-panel${isStreaming ? " loading" : ""}`}>
          {response || "Response will appear here once the model starts streaming."}
        </div>
        <div className="status-row">{helperText}</div>
      </div>
    </div>
  );
};

export default App;
