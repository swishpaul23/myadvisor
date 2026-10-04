import "server-only";

import { google } from "@ai-sdk/google";
import {
  generateText,
  jsonSchema,
  Output,
  streamText,
  type ModelMessage,
} from "ai";

/**
 * Server-only Gemini access through the Vercel AI SDK.
 *
 * The provider reads `GOOGLE_GENERATIVE_AI_API_KEY` when a request is sent,
 * not when this module loads, so `next build` does not need the key.
 * Call `readGoogleGenerativeAiApiKey()` inside the route or helper and return
 * `missingGoogleApiKeyResponse()` before starting a model call.
 *
 * Structured JSON uses `generateText` + `Output.object` + `jsonSchema`.
 * `generateObject` is deprecated in AI SDK 6. Do not add Zod, and do not call
 * the Gemini REST API or `@google/genai` directly.
 */

export const GEMINI_MODEL_ID = "gemini-2.5-flash";

export const MISSING_GOOGLE_API_KEY_ERROR =
  "Missing GOOGLE_GENERATIVE_AI_API_KEY.";

const DEFAULT_TIMEOUT_MS = 20_000;

const ADVISOR_UNAVAILABLE =
  "The advisor is unavailable right now. Try again in a moment.";

export function readGoogleGenerativeAiApiKey(): string | undefined {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  return key ? key : undefined;
}

export function missingGoogleApiKeyResponse(): Response {
  return Response.json(
    { error: MISSING_GOOGLE_API_KEY_ERROR },
    { status: 500 },
  );
}

/** Create the model during a request. Returns null when the key is absent. */
export function geminiModel() {
  if (!readGoogleGenerativeAiApiKey()) {
    return null;
  }

  return google(GEMINI_MODEL_ID);
}

type JsonSchemaInput<T> = Parameters<typeof jsonSchema<T>>[0];

export async function generateGeminiObject<T>({
  schema,
  name,
  description,
  prompt,
  system,
  temperature = 0,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fallback,
  isValid,
}: {
  schema: JsonSchemaInput<T>;
  name?: string;
  description?: string;
  prompt: string;
  system?: string;
  temperature?: number;
  timeoutMs?: number;
  fallback: T;
  isValid: (value: unknown) => value is T;
}): Promise<T> {
  const model = geminiModel();
  if (!model) {
    return fallback;
  }

  try {
    const result = await generateText({
      model,
      temperature,
      maxRetries: 1,
      timeout: timeoutMs,
      system,
      prompt,
      output: Output.object({
        schema: jsonSchema<T>(schema),
        name,
        description,
      }),
    });

    if (!isValid(result.output)) {
      return fallback;
    }

    return result.output;
  } catch (error) {
    console.error("Gemini structured output failed.", error);
    return fallback;
  }
}

/**
 * Structured JSON from a file (e.g. a transcript PDF) plus a text prompt. Same contract as
 * `generateGeminiObject`: returns `fallback` when the key is missing, the call fails or
 * times out, or the output doesn't pass `isValid`. The file is sent to the Gemini API
 * with the request and nothing is kept here.
 */
export async function generateGeminiObjectFromFile<T>({
  file,
  schema,
  name,
  description,
  prompt,
  system,
  temperature = 0,
  timeoutMs = 60_000,
  fallback,
  isValid,
}: {
  file: { data: Uint8Array; mediaType: string; filename?: string };
  schema: JsonSchemaInput<T>;
  name?: string;
  description?: string;
  prompt: string;
  system?: string;
  temperature?: number;
  timeoutMs?: number;
  fallback: T;
  isValid: (value: unknown) => value is T;
}): Promise<T> {
  const model = geminiModel();
  if (!model) {
    return fallback;
  }

  try {
    const result = await generateText({
      model,
      temperature,
      maxRetries: 1,
      timeout: timeoutMs,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "file",
              data: file.data,
              mediaType: file.mediaType,
              filename: file.filename,
            },
          ],
        },
      ],
      output: Output.object({
        schema: jsonSchema<T>(schema),
        name,
        description,
      }),
    });

    if (!isValid(result.output)) {
      return fallback;
    }

    return result.output;
  } catch (error) {
    // The error never includes the file's contents; log only that it failed.
    console.error(
      "Gemini file parsing failed.",
      error instanceof Error ? error.name : "",
    );
    return fallback;
  }
}

export async function generateGeminiText({
  prompt,
  system,
  temperature = 0,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fallback,
}: {
  prompt: string;
  system?: string;
  temperature?: number;
  timeoutMs?: number;
  fallback: string;
}): Promise<string> {
  const model = geminiModel();
  if (!model) {
    return fallback;
  }

  try {
    const result = await generateText({
      model,
      temperature,
      maxRetries: 1,
      timeout: timeoutMs,
      system,
      prompt,
    });

    const text = result.text.trim();
    return text || fallback;
  } catch (error) {
    console.error("Gemini text generation failed.", error);
    return fallback;
  }
}

/**
 * Streaming chat. A missing key is HTTP 500 and does not call the model.
 * A failed stream sends a fixed fallback message instead of throwing.
 */
export function streamGeminiChat({
  messages,
  system,
  temperature,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  messages: ModelMessage[];
  system?: string;
  temperature?: number;
  timeoutMs?: number;
}): Response {
  const model = geminiModel();
  if (!model) {
    return missingGoogleApiKeyResponse();
  }

  try {
    const result = streamText({
      model,
      messages,
      system,
      temperature,
      maxRetries: 1,
      timeout: timeoutMs,
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error("Gemini stream failed.", error);
        return ADVISOR_UNAVAILABLE;
      },
    });
  } catch (error) {
    console.error("Gemini stream failed to start.", error);
    return Response.json({ error: ADVISOR_UNAVAILABLE });
  }
}
