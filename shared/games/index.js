import * as clue from "./clue.js";
import * as crossword from "./crossword.js";
import * as wordsearch from "./wordsearch.js";

export const GAMES = { clue, crossword, wordsearch };
export const GAME_IDS = Object.keys(GAMES);
