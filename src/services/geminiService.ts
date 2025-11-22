// import { GoogleGenAI, Type } from "@google/genai";
// import { ExpenseCategory, type AIClassificationResult } from '../types';
import type { AIClassificationResult } from '../types';

// const apiKey = process.env.API_KEY || '';
// const ai = new GoogleGenAI({ apiKey });

// // Helper to get enum values for the prompt
// const categoriesList = Object.values(ExpenseCategory).join(', ');

export const classifyExpense = async (_description: string, _amount?: number): Promise<AIClassificationResult | null> => {
  // if (!description) return null;

  // try {
  //   const model = 'gemini-2.5-flash';

  //   const prompt = `
  //     Analyze the following expense description and amount (if provided) to determine the most appropriate category and generate 1-3 relevant tags.

  //     Description: "${description}"
  //     ${amount ? `Amount: ${amount}` : ''}

  //     Available Categories: ${categoriesList}

  //     Rules:
  //     1. Select exactly one category from the provided list.
  //     2. Generate 1 to 3 short, relevant tags (lowercase).
  //     3. If the description is ambiguous, use your best judgment based on common spending habits.
  //   `;

  //   const response = await ai.models.generateContent({
  //     model,
  //     contents: prompt,
  //     config: {
  //       responseMimeType: "application/json",
  //       responseSchema: {
  //         type: Type.OBJECT,
  //         properties: {
  //           category: {
  //             type: Type.STRING,
  //             enum: Object.values(ExpenseCategory),
  //           },
  //           tags: {
  //             type: Type.ARRAY,
  //             items: { type: Type.STRING },
  //           },
  //         },
  //         required: ["category", "tags"],
  //       },
  //     },
  //   });

  //   const text = response.text;
  //   if (!text) return null;

  //   const data = JSON.parse(text) as AIClassificationResult;
  //   return data;

  // } catch (error) {
  //   console.error("Error classifying expense:", error);
  //   return null;
  // }
  return null;
};
