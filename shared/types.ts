/**
 * Shared type definitions for poll-position application
 * Used across ingest (Python), API (Python), and UI (TypeScript) services
 */

// Core data structures from CollegeFootballData API
export interface RankRecord {
  school: string;
  rank: number;
  conference: string;
  firstPlaceVotes: number;
  points: number;
}

export interface PollRecord {
  poll: string;
  ranks: RankRecord[];
}

export interface SeasonRecord {
  season: number;
  seasonType: string;
  week: number;
  polls: PollRecord[];
}

export interface TeamRecord {
  id: number;
  school: string;
  mascot: string;
  abbreviation: string;
  alt_name1: string;
  alt_name2: string;
  alt_name3: string;
  conference: string;
  division: string;
  classification: string;
  color: string;
  alt_color: string;
  logos: string[];
}

// Flattened/processed data structures
export interface FlattenedPollRow {
  season: number;
  seasonType: string;
  week: number;
  poll: string;
  school: string;
  rank: number;
  conference: string;
  firstPlaceVotes: number;
  points: number;
  // Team data (joined)
  mascot?: string;
  color?: string;
  logos?: string[];
}

// UI-specific data structures
export interface UIRankData extends FlattenedPollRow {
  seasonWeek: string; // Format: "2024/1"
  visualRank: number;
  weekIndex: number; // Sequential index for x-axis positioning
}

// API response structures
export interface SeasonResponse {
  seasons: number[];
}

export interface PollDataResponse {
  season?: number;
  data: FlattenedPollRow[];
}

export interface SeasonPollsResponse {
  season: number;
  files: {
    key: string;
    lastModified: string;
    size: number;
  }[];
}