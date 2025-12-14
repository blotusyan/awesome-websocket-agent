# Awesome WebSocket Agent – Bedrock Streaming Chat

A minimal full-stack demo that streams Anthropic foundation model responses from AWS Bedrock to a React interface. The backend exposes a single SSE endpoint that relays tokens as they arrive, and the Vite/React frontend renders the stream in real time.

## Project Layout

```
.
├── backend/    # Express + TypeScript service that calls Bedrock
├── frontend/   # React + Vite client that consumes the SSE stream
└── README.md
```

## AWS Bedrock Prerequisites

1. **Enable Bedrock + Anthropic models in your account**
   - Open the AWS console → Amazon Bedrock → *Model access*.
   - Request access to the Anthropic Claude model(s) you plan to use (e.g., `anthropic.claude-3-sonnet-20240229-v1:0`).
   - Wait for the request to be approved; calls will fail with `AccessDeniedException` until the model is enabled.

2. **Create an IAM role or user for programmatic Bedrock access**
   - The simplest option is to attach the managed policy `AmazonBedrockFullAccess` to an IAM role/user that your CLI uses.
   - For tighter control, start with a policy like:

     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": [
             "bedrock:InvokeModel",
             "bedrock:InvokeModelWithResponseStream",
             "bedrock:Converse",
             "bedrock:ConverseStream"
           ],
           "Resource": "*"
         }
       ]
     }
     ```

3. **Configure AWS credentials locally**
   - With IAM user access keys: run `aws configure` and provide `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`.
   - With IAM roles or SSO: run `aws configure sso` or export environment variables such as `AWS_PROFILE`, `AWS_REGION`, and `AWS_SDK_LOAD_CONFIG=1` before starting the backend.
   - Verify connectivity: `aws bedrock list-foundation-models --region us-east-1`.

4. **Create a backend environment file**
   - Inside `backend/`, copy the template and edit values:

     ```bash
     cd backend
     cp .env.example .env
     # edit .env and set your region/model id/profile/etc.
     ```

### Backend environment variables

| Variable | Description |
| --- | --- |
| `PORT` | HTTP port for the backend (default `4000`). |
| `CORS_ORIGIN` | Comma-separated list of origins allowed to call the API (default `*`). |
| `BEDROCK_REGION` | AWS region where Bedrock is enabled (e.g., `us-east-1`). |
| `BEDROCK_MODEL_ID` | Anthropic model id such as `anthropic.claude-3-haiku-20240307-v1:0`. |
| `BEDROCK_MAX_TOKENS` | (Optional) Upper bound on generated tokens per response. |
| `BEDROCK_TEMPERATURE` / `BEDROCK_TOP_P` | (Optional) Sampling controls forwarded to Bedrock. |
| `BEDROCK_SYSTEM_PROMPT` | (Optional) System instructions applied to every request. |
| `AWS_PROFILE` / `AWS_ACCESS_KEY_ID` etc. | Standard AWS SDK configuration used by the backend process. |

### Frontend environment variable

| Variable | Description |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL for the backend (defaults to `http://localhost:4000`). Include `https://…` when deploying. |

## Backend (Express + TypeScript)

1. **Install dependencies**

   ```bash
   cd backend
   npm install
   ```

2. **Compile**

   ```bash
   npm run build
   ```

3. **Run in development (hot reload)**

   ```bash
   npm run dev
   ```

4. **Run the compiled server**

   ```bash
   npm start
   ```

5. **API contract**
   - `POST /api/chat`
     - Body: `{ "prompt": "Your message" }`
     - Response: `text/event-stream` where each `data:` frame contains `{ "token": "…" }`; the server emits `event: done` when generation finishes.

   Example request:

   ```bash
   curl -N http://localhost:4000/api/chat \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Give me three bullet points about serverless"}'
   ```

## Frontend (React + Vite + TypeScript)

1. **Install dependencies**

   ```bash
   cd frontend
   npm install
   ```

2. **Configure the backend URL (optional)**

   Create `frontend/.env` with `VITE_API_BASE_URL=http://localhost:4000` if you are not using the default.

3. **Compile**

   ```bash
   npm run build
   ```

4. **Run the dev server**

   ```bash
   npm run dev
   ```

5. **Preview the production build**

   ```bash
   npm run preview
   ```

## Streaming Flow

1. The React client submits a prompt and immediately starts reading the `ReadableStream` returned by `fetch`.
2. The backend calls `ConverseStream` on `@aws-sdk/client-bedrock-runtime` and forwards each token chunk as `text/event-stream` frames.
3. The UI appends each token as it arrives, and the "Stop" button cancels the `fetch` via `AbortController`.
4. If streaming is not available (for example, due to missing permissions) the backend automatically falls back to a regular `Converse` call and emits the final response as a single chunk.

## Deployment Notes

- Serve the frontend build artifacts (`frontend/dist`) from any static host (S3 + CloudFront, Amplify, etc.).
- Deploy the backend (e.g., AWS Lambda, ECS, or any Node.js host) with the environment variables above and network access to Bedrock.
- When hosting both tiers separately, set `VITE_API_BASE_URL` to the backend URL and configure `CORS_ORIGIN` accordingly.

## Troubleshooting

- **`AccessDeniedException`** – Verify the IAM principal has the Bedrock permissions listed earlier and that the chosen region/model is approved.
- **Network errors from the frontend** – Ensure the backend is running on port 4000 (or update `VITE_API_BASE_URL`).
- **Empty streaming response** – Check backend logs; if the server falls back to non-streaming, make sure `ConverseStream` is available in the region/model you selected.
- **`fetch` body missing** – Some legacy browsers do not expose streaming bodies; use a modern Chromium- or Firefox-based browser.
