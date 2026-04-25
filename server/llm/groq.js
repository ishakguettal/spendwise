import Groq from 'groq-sdk';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = 'llama-3.3-70b-versatile';

const RETRY_DELAYS = [5_000, 15_000, 45_000]; // ms — 3 attempts

function isRetryable(err) {
  const status = err?.status;
  if (status === 429 || status === 503) return true;
  const msg = String(err?.message ?? '');
  return msg.includes('429') || msg.includes('503')
      || msg.includes('Too Many Requests') || msg.includes('overloaded');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns a model-like object with a generateContent(userMsg) method that
 * matches the interface the prompt modules expect:
 *   const result = await model.generateContent(userMsg);
 *   const text   = result.response.text();
 */
export function getModel(systemInstruction) {
  const messages = systemInstruction
    ? [{ role: 'system', content: systemInstruction }]
    : [];

  async function generateContent(userMsg) {
    const fullMessages = [...messages, { role: 'user', content: userMsg }];

    let lastErr;
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const completion = await client.chat.completions.create({
          model: MODEL,
          messages: fullMessages,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content ?? '';
        return { response: { text: () => content } };
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err) || attempt === RETRY_DELAYS.length) break;
        const delaySec = RETRY_DELAYS[attempt] / 1000;
        console.warn(
          `[groq] Retry ${attempt + 1}/${RETRY_DELAYS.length} — ` +
          `status=${err?.status ?? 'unknown'} "${err?.message?.slice(0, 80)}" — ` +
          `waiting ${delaySec}s`
        );
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
    throw lastErr;
  }

  return { generateContent };
}
