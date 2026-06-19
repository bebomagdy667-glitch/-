/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Question {
  id: number;
  text: string;
  options: string[]; // Exactly 3 options
  correctIndex: number; // 0, 1, or 2
}

export interface Verse {
  text: string;
  num: number;
}

export interface DayData {
  id: number; // 1 to 305
  chapter: number; // 1 to 31
  verses: Verse[]; // Exact 3 verses
  questions: Question[]; // Exact 3 questions
  isOpen: boolean;
}

export interface DayAnswers {
  solvedAt: string;
  answers: number[]; // Index of selected option for each of the 3 questions
  score: number; // 0 to 3
  correctAnswers?: number[]; // Added for correct verification layout after solving is completed
}

export interface Subscriber {
  id: string;
  name: string;
  joinedAt: string;
  solvedDays: { [dayId: number]: DayAnswers };
}

export interface DatabaseState {
  password?: string;
  days: { [dayId: number]: DayData };
  subscribers: Subscriber[];
}
