import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const RETRY_DELAYS = [5_000, 15_000, 45_000]; // ms — 3 attempts

function isRetryable(err) {
  const status = err?.status;
  if (status === 429 || status === 503) return true;
  // Fallback: SDK may embed the code only in the message string
  const msg = String(err?.message ?? '');
  return msg.includes('429') || msg.includes('503')
      || msg.includes('Too Many Requests') || msg.includes('overloaded');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns a configured gemini-2.5-flash model instance with retry logic
 * wrapping generateContent (up to 3 retries on 429/503).
 */
export function getModel(systemInstruction) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    ...(systemInstruction ? { systemInstruction } : {}),
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  });

  const _generate = model.generateContent.bind(model);
  model.generateContent = async function (...args) {
    let lastErr;
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        return await _generate(...args);
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err) || attempt === RETRY_DELAYS.length) break;
        const delaySec = RETRY_DELAYS[attempt] / 1000;
        console.warn(
          `[gemini] Retry ${attempt + 1}/${RETRY_DELAYS.length} — ` +
          `status=${err?.status ?? 'unknown'} "${err?.message?.slice(0, 80)}" — ` +
          `waiting ${delaySec}s`
        );
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
    throw lastErr;
  };

  return model;
}
