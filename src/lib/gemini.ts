import { SYLLABUS_TOPICS } from "../types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = "gpt-5-nano";
const MAX_QUESTION_EXTRACTION_CHARS = 22000;
const MAX_MARKSCHEME_EXTRACTION_CHARS = 18000;
const MAX_CATEGORIZATION_QUESTION_CHARS = 700;

async function callOpenAI(prompt: string, expectJson: boolean): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY. Add it to your environment.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      ...(expectJson ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

function parseJsonObjectLoose(input: string): Record<string, any> | null {
  try {
    return JSON.parse(input);
  } catch {
    const firstBrace = input.indexOf("{");
    const lastBrace = input.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    try {
      return JSON.parse(input.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function heuristicExtractQuestions(text: string) {
  const compact = text.replace(/\r/g, "");
  const matches = [...compact.matchAll(/(?:^|\n)\s*(\d+)\s+([^\n]{12,})(?:\n|$)/g)];
  const results: Array<{ number: number; text: string; marks: number }> = [];

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    const number = Number(current[1]);
    const start = current.index ?? 0;
    const end = next?.index ?? compact.length;
    const chunk = compact.slice(start, end).trim();
    if (!Number.isFinite(number) || chunk.length < 25) continue;

    const marksMatch = chunk.match(/\[(\d{1,2})\]/);
    const marks = marksMatch ? Number(marksMatch[1]) : 1;
    results.push({ number, text: chunk.slice(0, 3000), marks });
  }

  return results;
}

/**
 * Extracts questions from raw text using GPT-5 nano.
 * We use the generative model here because splitting a PDF into clean 
 * question-answer pairs is a complex structural task.
 */
export async function extractQuestionsFromText(text: string, paperInfo: string) {
  if (!text || text.trim().length < 10) {
    console.warn("Text is too short to extract questions");
    return [];
  }

  const responseText = await callOpenAI(
    `You are an expert IGCSE Computer Science examiner. Extract all questions from the provided exam paper text (${paperInfo}).

For each question, extract:
1. The question number (as an integer).
2. The full question text, including any sub-parts (a, b, c) if they belong to the same main question.
3. The total marks for that question (as an integer).

Return JSON only in this exact shape:
{"questions":[{"number":1,"text":"...","marks":5}]}

Exam Paper Text:
${text.substring(0, MAX_QUESTION_EXTRACTION_CHARS)}`,
    true
  );

  const data = parseJsonObjectLoose(responseText || "");
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  if (questions.length > 0) return questions;

  console.warn("[EXTRACTION_EMPTY_OR_BAD_JSON]", {
    model: OPENAI_MODEL,
    preview: (responseText || "").slice(0, 500),
  });
  const fallback = heuristicExtractQuestions(text);
  console.warn("[EXTRACTION_HEURISTIC_COUNT]", fallback.length);
  return fallback;
}

/**
 * Categorizes questions into syllabus topics in one API call.
 */
export async function categorizeQuestionsBatch(questionTexts: string[]): Promise<string[]> {
  if (!questionTexts.length) return [];
  const topicList = SYLLABUS_TOPICS.map(t => `${t.id}: ${t.title}`).join('\n');

  const questionsText = questionTexts
    .map((q, i) => `${i + 1}. ${q.substring(0, MAX_CATEGORIZATION_QUESTION_CHARS)}`)
    .join("\n\n");

  try {
    const responseText = await callOpenAI(
      `Categorize each IGCSE Computer Science question into exactly ONE topic ID from the list below.
Return JSON only in this exact shape:
{"topicIds":["1.1","2.3"]}
The output array must have exactly ${questionTexts.length} entries in the same order as input questions.

Topics:
${topicList}

Questions:
${questionsText}`,
      true
    );

    const data = parseJsonObjectLoose(responseText || "") || {};
    const topicIds = Array.isArray(data?.topicIds) ? data.topicIds : [];
    return questionTexts.map((_, i) => {
      const candidate = String(topicIds[i] || "").trim();
      const match = candidate.match(/\d+(\.\d+)?/);
      return match ? match[0] : "1.1";
    });
  } catch (error) {
    console.error("Failed to batch categorize questions", error);
    return questionTexts.map(() => "1.1");
  }
}

/**
 * Extracts marking points from a Mark Scheme PDF text.
 * Returns a mapping of question numbers to their marking points.
 */
export async function extractMarkSchemeFromText(text: string, paperInfo: string) {
  if (!text || text.trim().length < 10) {
    console.warn("Text is too short to extract mark scheme");
    return {};
  }

  const responseText = await callOpenAI(
    `You are an expert IGCSE Computer Science examiner. Extract the marking points from the provided Mark Scheme text (${paperInfo}).

For each question, extract:
1. The question number (as an integer).
2. The marking points/answer key for that question.

Return JSON only in this exact shape:
{"markScheme":{"1":"...","2":"..."}}

Mark Scheme Text:
${text.substring(0, MAX_MARKSCHEME_EXTRACTION_CHARS)}`,
    true
  );

  try {
    const data = parseJsonObjectLoose(responseText || "") || {};
    return data?.markScheme && typeof data.markScheme === "object" ? data.markScheme : {};
  } catch (e) {
    console.error("Failed to parse mark scheme", e);
    return {};
  }
}
