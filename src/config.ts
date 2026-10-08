import * as fs from 'fs';

/** Settings read from `config.json` in the config dir; every field is optional. */
export interface Config {
    /** Skip the prompt while any app holds the mic (see microphone.ts). Off by default. */
    micCheck: boolean;
}

const DEFAULT_CONFIG: Config = { micCheck: false };

/** Pure: merges a parsed config.json over the defaults, ignoring wrongly typed fields. */
export const parseConfig = (raw: unknown): Config => {
    const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
        micCheck: typeof obj.micCheck === 'boolean' ? obj.micCheck : DEFAULT_CONFIG.micCheck,
    };
};

/** Reads the config file, falling back to defaults if it's missing or unparseable. */
export const loadConfig = (filePath: string): Config => {
    try {
        return parseConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch {
        return DEFAULT_CONFIG;
    }
};
