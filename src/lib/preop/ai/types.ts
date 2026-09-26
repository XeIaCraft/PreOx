// Shapes shared by the AI assistant's server code and its screens.

export interface AiStatus {
  gemini: { configured: boolean; from: "preop" | "a-table" | null; model: string };
  consensus: { configured: boolean; limit: number; used: number; month: string };
}

export interface ConsensusPaper {
  title: string;
  authors: string[];
  year: number | null;
  journal: string;
  doi: string;
  url: string;
  studyType: string;
  citations: number | null;
  takeaway: string;
  abstract: string;
}
