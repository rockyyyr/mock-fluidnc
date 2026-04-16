export interface GCodeWord {
  letter: string;
  value: number;
  raw: string;
}

export interface ParsedGCodeLine {
  raw: string;
  cleaned: string;
  lineNumber?: number;
  checksum?: number;
  words: GCodeWord[];
}

export class GCodeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GCodeParseError";
  }
}

export function parseGCodeLine(raw: string): ParsedGCodeLine {
  const withoutComments = stripComments(raw);
  const { command, checksum } = splitChecksum(withoutComments);
  const cleaned = command.trim();
  if (!cleaned) {
    return { raw, cleaned, checksum, words: [] };
  }

  const words: GCodeWord[] = [];
  const wordPattern = /([A-Za-z])([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g;
  let match: RegExpExecArray | null;
  let consumed = "";

  while ((match = wordPattern.exec(cleaned)) !== null) {
    const [rawWord, letter, numericValue] = match;
    consumed += rawWord;
    words.push({
      letter: letter.toUpperCase(),
      value: Number(numericValue),
      raw: rawWord
    });
  }

  if (words.length === 0 || consumed.length !== cleaned.replace(/\s+/g, "").length) {
    throw new GCodeParseError("Unsupported or malformed G-code word");
  }

  const lineWord = words.find((word) => word.letter === "N");
  return {
    raw,
    cleaned,
    lineNumber: lineWord?.value,
    checksum,
    words: words.filter((word) => word.letter !== "N")
  };
}

function stripComments(raw: string): string {
  let result = "";
  let inParenComment = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === ";") {
      break;
    }
    if (char === "(") {
      inParenComment = true;
      continue;
    }
    if (char === ")") {
      inParenComment = false;
      continue;
    }
    if (!inParenComment) {
      result += char;
    }
  }

  return result;
}

function splitChecksum(command: string): { command: string; checksum?: number } {
  const checksumIndex = command.lastIndexOf("*");
  if (checksumIndex === -1) {
    return { command };
  }

  const checksumText = command.slice(checksumIndex + 1).trim();
  const checksum = Number(checksumText);
  if (!Number.isInteger(checksum)) {
    throw new GCodeParseError("Invalid checksum");
  }

  return {
    command: command.slice(0, checksumIndex),
    checksum
  };
}
