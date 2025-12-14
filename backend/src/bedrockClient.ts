import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type ConverseCommandInput,
  type ConverseStreamCommandInput
} from "@aws-sdk/client-bedrock-runtime";
import { appConfig } from "./config.js";
import { processStreamEvent } from "./bedrockStream.js";

const {
  bedrock: {
    region,
    modelId,
    inference: { maxTokens, temperature, topP, stopSequences, systemPrompt }
  }
} = appConfig;

const client = new BedrockRuntimeClient({ region });

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
      temperature,
      topP,
      maxTokens,
      stopSequences
    }
  };

  if (systemPrompt) {
    payload.system = [{ text: systemPrompt }];
  }

  return payload;
};

/**
 * Stream a Bedrock response token-by-token, falling back to a single
 * Converse invocation when the streaming API is unavailable.
 */
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
