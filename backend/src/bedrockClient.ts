import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type ConverseCommandInput,
  type ConverseStreamCommandInput,
  type ConverseStreamOutput
} from "@aws-sdk/client-bedrock-runtime";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_MODEL = "anthropic.claude-3-haiku-20240307-v1:0";

const region = process.env.BEDROCK_REGION || "us-east-1";
const modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL;

const client = new BedrockRuntimeClient({ region });

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildPayload = (prompt: string): ConverseStreamCommandInput => {
  const payload: ConverseStreamCommandInput = {
    modelId,
    messages: [
      {
        role: "user",
        content: [
          {
            text: prompt
          }
        ]
      }
    ],
    inferenceConfig: {
      temperature: parseNumber(process.env.BEDROCK_TEMPERATURE, 0.5),
      topP: parseNumber(process.env.BEDROCK_TOP_P, 0.9),
      maxTokens: parseNumber(process.env.BEDROCK_MAX_TOKENS, 128),
      stopSequences: process.env.BEDROCK_STOP_SEQUENCES
        ? process.env.BEDROCK_STOP_SEQUENCES.split(",").map((item) => item.trim()).filter(Boolean)
        : undefined
    }
  };

  if (process.env.BEDROCK_SYSTEM_PROMPT) {
    payload.system = [{ text: process.env.BEDROCK_SYSTEM_PROMPT }];
  }

  return payload;
};

export async function* streamBedrockResponse(prompt: string): AsyncGenerator<string> {
  const payload = buildPayload(prompt);
  console.info(
    `[bedrock] Invoking ${modelId} in ${region} with promptLength=${prompt.length} characters and maxTokens=${payload.inferenceConfig?.maxTokens}`
  );

  try {
    const response = await client.send(new ConverseStreamCommand(payload));
    if (response.stream) {
      let tokenCount = 0;
      for await (const event of response.stream) {
        const { text, done } = processStreamEvent(event);
        if (text) {
          yield text;
          tokenCount += 1;
        }
        if (done) {
          console.info(`[bedrock] Stream emitted ${tokenCount} chunks.`);
          return;
        }
      }
      console.warn("[bedrock] Stream ended without messageStop signal.");
      return;
    }
    console.warn("[bedrock] ConverseStream response did not include a stream; falling back.");
  } catch (error) {
    console.error("ConverseStream failed; falling back to Converse", error);
  }

  console.info("[bedrock] Issuing fallback Converse request.");
  const fallbackResponse = await client.send(new ConverseCommand(payload as ConverseCommandInput));
  const text = fallbackResponse.output?.message?.content
    ?.map((item) => item.text ?? "")
    .join("")
    .trim();
  if (text) {
    console.info(`[bedrock] Fallback response returned ${text.length} characters.`);
    yield text;
  }
}

type StreamEventResult = {
  text?: string;
  done?: boolean;
};

const processStreamEvent = (event: ConverseStreamOutput): StreamEventResult => {
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
