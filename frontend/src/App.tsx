import { useStreamingSubmit } from "./hooks/useStreamingSubmit";

const App = () => {
  const {
    prompt,
    response,
    isStreaming,
    error,
    helperText,
    setPrompt,
    handleStop,
    handleSubmit
  } = useStreamingSubmit("Give me a prompt and I will respond here.");

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
