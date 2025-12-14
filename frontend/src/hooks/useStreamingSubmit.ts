import { useCallback, useMemo, useRef, useState } from "react";
import { startStreamingChat, type StreamEvent } from "../lib/api";

type UseStreamingSubmitResult = {
  prompt: string;
  response: string;
  isStreaming: boolean;
  error: string | null;
  helperText: string;
  setPrompt: (value: string) => void;
  handleStop: () => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
};

export const useStreamingSubmit = (initialResponse: string): UseStreamingSubmitResult => {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState(initialResponse);
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

  const helperText = useMemo(() => {
    if (error) {
      return error;
    }
    if (isStreaming) {
      return "Streaming response from Anthropic via Bedrock...";
    }
    return "Idle";
  }, [error, isStreaming]);

  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      if (event.event === "message" && event.data) {
        const payload = JSON.parse(event.data) as { token?: string };
        // backend gives data like: data: {"token":"Goo"}
        if (payload.token) {
          setResponse((prev) => prev + payload.token);
        }
        return;
      }
      if (event.event === "error") {
        const payload = JSON.parse(event.data) as { message?: string };
        throw new Error(payload.message ?? "Bedrock reported an error");
      }
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
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
        await startStreamingChat(prompt, controller.signal, handleStreamEvent);
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
    },
    [handleStreamEvent, isStreaming, prompt]
  );

  return {
    prompt,
    response,
    isStreaming,
    error,
    helperText,
    setPrompt,
    handleStop,
    handleSubmit
  };
};
