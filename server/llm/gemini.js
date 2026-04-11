import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Returns a configured gemini-1.5-flash model instance.
 * @param {string} [systemInstruction] - Optional system instruction for this model instance.
 */
export function getModel(systemInstruction) {
  return genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    ...(systemInstruction ? { systemInstruction } : {}),
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  });
}
