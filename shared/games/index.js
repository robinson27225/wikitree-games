import * as clue from "./clue.js";
import * as crossword from "./crossword.js";
import * as wordsearch from "./wordsearch.js";
import * as wheel from "./wheel.js";

export const GAMES = { clue, crossword, wordsearch, wheel };
export const GAME_IDS = Object.keys(GAMES);
