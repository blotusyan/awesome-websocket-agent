import dotenv from "dotenv";

dotenv.config();

const toNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toList = (value: string | undefined): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return trimmed.length > 0 ? trimmed : undefined;
};

export type ServerConfig = {
  port: number;
  corsOrigins?: string[];
  allowAllOrigins: boolean;
};

export type BedrockInferenceConfig = {
  maxTokens: number;
  temperature: number;
  topP: number;
  stopSequences?: string[];
  systemPrompt?: string;
};

export type BedrockConfig = {
  region: string;
  modelId: string;
  inference: BedrockInferenceConfig;
};

export type AppConfig = {
  server: ServerConfig;
  bedrock: BedrockConfig;
};

const DEFAULT_MODEL = "anthropic.claude-3-haiku-20240307-v1:0";
const DEFAULT_REGION = "us-east-1";

const corsEnv = process.env.CORS_ORIGIN || "*";
const corsOrigins = corsEnv === "*" ? undefined : toList(corsEnv);

export const appConfig: AppConfig = {
  server: {
    port: toNumber(process.env.PORT, 4000),
    corsOrigins,
    allowAllOrigins: !corsOrigins
  },
  bedrock: {
    region: process.env.BEDROCK_REGION || DEFAULT_REGION,
    modelId: process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL,
    inference: {
      maxTokens: toNumber(process.env.BEDROCK_MAX_TOKENS, 128),
      temperature: toNumber(process.env.BEDROCK_TEMPERATURE, 0.5),
      topP: toNumber(process.env.BEDROCK_TOP_P, 0.9),
      stopSequences: toList(process.env.BEDROCK_STOP_SEQUENCES),
      systemPrompt: process.env.BEDROCK_SYSTEM_PROMPT
    }
  }
};
