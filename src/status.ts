import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_DIR_NAME, getLocalDateString, minutesUntilNextPrompt } from './state';

/**
 * Prints minutes until the next prompt (negative if overdue) for today's day
 * file. Polled by the macOS menu bar app (scripts/menubar.swift).
 */
const now = new Date();
const filePath = path.join(
    process.env.HOME || process.env.USERPROFILE || '.',
    CONFIG_DIR_NAME,
    `${getLocalDateString(now)}.txt`,
);
const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split('\n') : [];
console.log(minutesUntilNextPrompt(lines, now));
