/**
 * ============================================================================
 * UniComp Core Tokenizer v1.0
 * ============================================================================
 * Лексический анализатор для всех 9 форматов UniComp.
 * Основано на спецификации UniComp v1.0 (log.txt)
 * 
 * Импорт:
 *   import { Tokenizer, TokenType, Token } from '../unicomp-core/tokenizer';
 * 
 * Вес: ~12 KB (minified + gzip)
 * ============================================================================
 */

import { SECURITY_LIMITS } from './utils';

// ============================================================================
// 1. TOKEN TYPES (Типы токенов)
// ============================================================================

export enum TokenType {
  // Скобки и разделители
  LPAREN = 'LPAREN',         // (
  RPAREN = 'RPAREN',         // )
  LBRACKET = 'LBRACKET',     // [
  RBRACKET = 'RBRACKET',     // ]
  COLON = 'COLON',           // :
  SEMICOLON = 'SEMICOLON',   // ;
  COMMA = 'COMMA',           // ,
  
  // Операторы
  DASH = 'DASH',             // -
  PLUS = 'PLUS',             // +
  EQUALS = 'EQUALS',         // =
  GREATER = 'GREATER',       // >
  LESS = 'LESS',             // <
  
  // Значения
  NUMBER = 'NUMBER',
  SYMBOL = 'SYMBOL',
  QUOTED_STRING = 'QUOTED_STRING',
  IDENTIFIER = 'IDENTIFIER',
  
  // Специальные
  TIMES = 'TIMES',           // ×, x, X (для сетки)
  HASH_REF = 'HASH_REF',     // #id
  AT_REF = 'AT_REF',         // @name
  DOT_REF = 'DOT_REF',       // .class
  DOLLAR_REF = 'DOLLAR_REF', // $src
  
  // Служебные
  EOF = 'EOF',
  UNKNOWN = 'UNKNOWN',
}

// ============================================================================
// 2. TOKEN INTERFACE
// ============================================================================

export interface Token {
  type: TokenType;
  value: string;
  position: number;
  line: number;
  column: number;
}

// ============================================================================
// 3. SECURITY ERROR
// ============================================================================

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

// ============================================================================
// 4. HELPER FUNCTIONS
// ============================================================================

function isDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isLetter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isWhitespace(char: string): boolean {
  const code = char.charCodeAt(0);
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function isIdentifierChar(char: string): boolean {
  return isLetter(char) || char === '_' || isDigit(char);
}

function isIdentifierStartChar(char: string): boolean {
  return isLetter(char) || char === '_';
}

const SPECIAL_CHARS = new Set([
  '(', ')', '[', ']', '{', '}',
  ':', ';', ',', '-', '=',
  '"', "'", '`', '\\',
  '<', '>', '^', '№',
  '!', '?', '*', '×', '÷',
  '+', '_', '~', '/', '|',
  '&', '%', '$', '#'
]);

// ============================================================================
// 5. TOKENIZER CLASS
// ============================================================================

export class Tokenizer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];
  private startTime: number;
  private inGridSpec: boolean = false;

  constructor(input: string) {
    if (input.length > SECURITY_LIMITS.MAX_INPUT_LENGTH) {
      throw new SecurityError(
        `Input too long: ${input.length} chars (max: ${SECURITY_LIMITS.MAX_INPUT_LENGTH})`
      );
    }
    this.input = input;
    this.startTime = Date.now();
  }

  private checkTimeout(): void {
    if (Date.now() - this.startTime > SECURITY_LIMITS.TIMEOUT_MS) {
      throw new SecurityError('Parsing timeout exceeded');
    }
  }

  private currentChar(): string | null {
    return this.position < this.input.length ? this.input[this.position] : null;
  }

  private advance(): void {
    if (this.position < this.input.length) {
      if (this.input[this.position] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }
  }

  private skipWhitespace(): void {
    while (this.currentChar() && isWhitespace(this.currentChar()!)) {
      this.advance();
    }
  }

  // --------------------------------------------------------------------------
  // READERS
  // --------------------------------------------------------------------------

  private readNumber(): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    while (this.currentChar() && isDigit(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    if (this.currentChar() === '.') {
      value += this.currentChar();
      this.advance();
      while (this.currentChar() && isDigit(this.currentChar()!)) {
        value += this.currentChar();
        this.advance();
      }
    }

    return {
      type: TokenType.NUMBER,
      value,
      position: startPos,
      line: startLine,
      column: startCol,
    };
  }

  private readQuotedString(quoteChar: string): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    this.advance(); // skip opening quote

    while (this.currentChar() && this.currentChar() !== quoteChar) {
      if (this.currentChar() === '\\') {
        this.advance();
        const escaped = this.currentChar();
        if (escaped) {
          switch (escaped) {
            case 'n': value += '\n'; break;
            case 't': value += '\t'; break;
            case 'r': value += '\r'; break;
            default: value += escaped;
          }
          this.advance();
        }
      } else {
        value += this.currentChar();
        this.advance();
      }
    }

    if (this.currentChar() === quoteChar) {
      this.advance();
    } else {
      throw new Error(
        `Unclosed quote starting at line ${startLine}, column ${startCol}`
      );
    }

    return {
      type: TokenType.QUOTED_STRING,
      value,
      position: startPos,
      line: startLine,
      column: startCol,
    };
  }

  private readIdentifier(): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    if (this.currentChar() && isIdentifierStartChar(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    while (this.currentChar() && isIdentifierChar(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    return {
      type: TokenType.IDENTIFIER,
      value,
      position: startPos,
      line: startLine,
      column: startCol,
    };
  }

  private readRefToken(prefix: string, tokenType: TokenType): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;

    this.advance(); // skip prefix (#, @, ., $)

    let value = '';
    while (this.currentChar() && isIdentifierChar(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    if (value.length === 0) {
      throw new Error(
        `Expected identifier after '${prefix}' at line ${startLine}, column ${startCol}`
      );
    }

    return {
      type: tokenType,
      value,
      position: startPos,
      line: startLine,
      column: startCol,
    };
  }

  private readSymbol(): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;

    // Handle escape
    if (this.currentChar() === '\\') {
      this.advance();
      const escaped = this.currentChar();
      if (escaped) {
        this.advance();
        return {
          type: TokenType.SYMBOL,
          value: escaped,
          position: startPos,
          line: startLine,
          column: startCol,
        };
      }
      throw new Error(`Invalid escape at end of input`);
    }

    const char = this.currentChar();
    if (char) {
      const code = char.charCodeAt(0);
      
      // Handle surrogate pairs for emojis
      if (code >= 0xD800 && code <= 0xDBFF) {
        this.advance();
        const low = this.currentChar();
        if (low) {
          this.advance();
          return {
            type: TokenType.SYMBOL,
            value: char + low,
            position: startPos,
            line: startLine,
            column: startCol,
          };
        }
      }

      this.advance();
      return {
        type: TokenType.SYMBOL,
        value: char,
        position: startPos,
        line: startLine,
        column: startCol,
      };
    }

    throw new Error(`Unexpected character at position ${startPos}`);
  }

  // --------------------------------------------------------------------------
  // MAIN TOKENIZE METHOD
  // --------------------------------------------------------------------------

  tokenize(): Token[] {
    this.tokens = [];
    this.inGridSpec = false;

    while (this.position < this.input.length) {
      this.checkTimeout();
      this.skipWhitespace();

      if (this.position >= this.input.length) break;

      const char = this.currentChar()!;

      switch (char) {
        case '(':
          this.inGridSpec = true;
          this.tokens.push({
            type: TokenType.LPAREN,
            value: '(',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case ')':
          this.inGridSpec = false;
          this.tokens.push({
            type: TokenType.RPAREN,
            value: ')',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case '[':
          this.tokens.push({
            type: TokenType.LBRACKET,
            value: '[',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case ']':
          this.tokens.push({
            type: TokenType.RBRACKET,
            value: ']',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case ':':
          this.tokens.push({
            type: TokenType.COLON,
            value: ':',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case ';':
          this.tokens.push({
            type: TokenType.SEMICOLON,
            value: ';',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case ',':
          this.tokens.push({
            type: TokenType.COMMA,
            value: ',',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case '-':
          this.tokens.push({
            type: TokenType.DASH,
            value: '-',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case '+':
          this.tokens.push({
            type: TokenType.PLUS,
            value: '+',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case '>':
          this.tokens.push({
            type: TokenType.GREATER,
            value: '>',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case '<':
          this.tokens.push({
            type: TokenType.LESS,
            value: '<',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case '=':
          this.tokens.push({
            type: TokenType.EQUALS,
            value: '=',
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case '×':
          this.tokens.push({
            type: TokenType.TIMES,
            value: char,
            position: this.position,
            line: this.line,
            column: this.column,
          });
          this.advance();
          break;

        case 'x':
        case 'X':
          if (this.inGridSpec) {
            this.tokens.push({
              type: TokenType.TIMES,
              value: char,
              position: this.position,
              line: this.line,
              column: this.column,
            });
            this.advance();
          } else {
            this.tokens.push(this.readIdentifier());
          }
          break;

        case '"':
        case "'":
        case '`':
          this.tokens.push(this.readQuotedString(char));
          break;

        case '#': {
          const nextPos = this.position + 1;
          if (
            nextPos < this.input.length &&
            isIdentifierStartChar(this.input[nextPos])
          ) {
            this.tokens.push(this.readRefToken('#', TokenType.HASH_REF));
          } else {
            this.tokens.push({
              type: TokenType.UNKNOWN,
              value: char,
              position: this.position,
              line: this.line,
              column: this.column,
            });
            this.advance();
          }
          break;
        }

        case '@': {
          const nextPos = this.position + 1;
          if (
            nextPos < this.input.length &&
            isIdentifierStartChar(this.input[nextPos])
          ) {
            this.tokens.push(this.readRefToken('@', TokenType.AT_REF));
          } else {
            this.tokens.push({
              type: TokenType.UNKNOWN,
              value: char,
              position: this.position,
              line: this.line,
              column: this.column,
            });
            this.advance();
          }
          break;
        }

        case '.': {
          const nextPos = this.position + 1;
          if (
            !this.inGridSpec &&
            nextPos < this.input.length &&
            isIdentifierStartChar(this.input[nextPos])
          ) {
            this.tokens.push(this.readRefToken('.', TokenType.DOT_REF));
          } else {
            this.tokens.push({
              type: TokenType.UNKNOWN,
              value: char,
              position: this.position,
              line: this.line,
              column: this.column,
            });
            this.advance();
          }
          break;
        }

        case '$': {
          const nextPos = this.position + 1;
          if (
            nextPos < this.input.length &&
            isIdentifierStartChar(this.input[nextPos])
          ) {
            this.tokens.push(this.readRefToken('$', TokenType.DOLLAR_REF));
          } else {
            this.tokens.push({
              type: TokenType.UNKNOWN,
              value: char,
              position: this.position,
              line: this.line,
              column: this.column,
            });
            this.advance();
          }
          break;
        }

        default:
          if (isDigit(char)) {
            this.tokens.push(this.readNumber());
          } else if (isIdentifierStartChar(char)) {
            this.tokens.push(this.readIdentifier());
          } else {
            if (SPECIAL_CHARS.has(char)) {
              this.tokens.push({
                type: TokenType.UNKNOWN,
                value: char,
                position: this.position,
                line: this.line,
                column: this.column,
              });
              this.advance();
            } else {
              this.tokens.push(this.readSymbol());
            }
          }
      }
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      position: this.position,
      line: this.line,
      column: this.column,
    });

    return this.tokens;
  }
}

// ============================================================================
// 6. PUBLIC API
// ============================================================================

export function tokenize(input: string): Token[] {
  const tokenizer = new Tokenizer(input);
  return tokenizer.tokenize();
}

export function tokenTypeToString(type: TokenType): string {
  const map: Record<TokenType, string> = {
    [TokenType.LPAREN]: '(',
    [TokenType.RPAREN]: ')',
    [TokenType.LBRACKET]: '[',
    [TokenType.RBRACKET]: ']',
    [TokenType.COLON]: ':',
    [TokenType.SEMICOLON]: ';',
    [TokenType.COMMA]: ',',
    [TokenType.DASH]: '-',
    [TokenType.PLUS]: '+',
    [TokenType.EQUALS]: '=',
    [TokenType.GREATER]: '>',
    [TokenType.LESS]: '<',
    [TokenType.NUMBER]: 'NUMBER',
    [TokenType.SYMBOL]: 'SYMBOL',
    [TokenType.QUOTED_STRING]: 'STRING',
    [TokenType.IDENTIFIER]: 'ID',
    [TokenType.TIMES]: '×',
    [TokenType.HASH_REF]: '#',
    [TokenType.AT_REF]: '@',
    [TokenType.DOT_REF]: '.',
    [TokenType.DOLLAR_REF]: '$',
    [TokenType.EOF]: 'EOF',
    [TokenType.UNKNOWN]: '?',
  };
  return map[type] || type;
}

export function tokensToString(tokens: Token[]): string {
  return tokens
    .filter((t) => t.type !== TokenType.EOF)
    .map((t) => t.value)
    .join('');
}