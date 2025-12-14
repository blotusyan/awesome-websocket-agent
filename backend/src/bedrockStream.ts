import type { ConverseStreamOutput } from "@aws-sdk/client-bedrock-runtime";

export type StreamEventResult = {
  text?: string;
  done?: boolean;
};

export const processStreamEvent = (event: ConverseStreamOutput): StreamEventResult => {
  if (event.messageStart) {
    console.debug(`[bedrock] Message start: role=${event.messageStart.role}`);
    return {};
  }
  if (event.contentBlockStart) {
    console.debug(`[bedrock] Content block start index=${event.contentBlockStart.contentBlockIndex}`);
    return {};
  }
  if (event.contentBlockDelta?.delta?.text) {
    return { text: event.contentBlockDelta.delta.text };
  }
  if (event.contentBlockStop) {
    console.debug(`[bedrock] Content block stop index=${event.contentBlockStop.contentBlockIndex}`);
    return {};
  }
  if (event.metadata?.usage) {
    console.info(
      `[bedrock] Usage input=${event.metadata.usage.inputTokens} output=${event.metadata.usage.outputTokens}`
    );
    return {};
  }
  if (event.messageStop) {
    console.info(`[bedrock] Message stopped with reason ${event.messageStop.stopReason}`);
    return { done: true };
  }
  if (event.internalServerException) {
    throw new Error("Bedrock internal server error during streaming.");
  }
  if (event.modelStreamErrorException) {
    throw new Error(
      `Bedrock model stream error: ${event.modelStreamErrorException.message ?? "unknown error"}`
    );
  }
  if (event.validationException) {
    throw new Error(`Bedrock rejected the stream payload: ${event.validationException.message}`);
  }
  if (event.throttlingException) {
    throw new Error(`Bedrock throttled the stream: ${event.throttlingException.message}`);
  }
  if (event.serviceUnavailableException) {
    throw new Error("Bedrock service unavailable during stream.");
  }
  return {};
};
