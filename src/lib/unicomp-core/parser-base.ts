/**
 * ============================================================================
 * UniComp Core Parser Base v1.0
 * ============================================================================
 * Базовый парсер для всех 9 форматов UniComp.
 * Основано на спецификации UniComp v1.0 (log.txt)
 * 
 * Ключевая модель:
 * - grid = объединённые bounds всех слоёв
 * - pg = якорь первичной сетки (движется с расширением grid)
 * - po = смещение слоя относительно pg
 * - d = pg + po (финальные координаты после "запекания")
 * 
 * УДАЛЕНО: me, se, el, et, hl, ht, o, s, debt-логика
 * СОХРАНЕНО: DeltaOp (=, +=, -=, >=, <=) для истории и анимации
 * 
 * Импорт:
 *   import { BaseParser, parseBaseSpec } from '../unicomp-core/parser-base';
 * 
 * Вес: ~8 KB (minified + gzip)
 * ============================================================================
 */

import type {
  Vec2,
  Vec3,
  Vec4,
  Bounds,
  BaseSymbol,
  BaseSpec,
  TransformVector,
  LayerStyles,
  GridStyles,
  Keyframe,
  ParserMode,
  UniFormat,
  DeltaOp
} from './types';

import {
  SECURITY_LIMITS,
  parseBounds,
  parseAngleForce,
  parseVec2,
  parseVec3,
  parseVec4,
  detectFormat,
  isCommentLine,
  computeDFromPgPo,
  computePoFromD
} from './utils';

// ============================================================================
// 1. TOKENIZER (Базовый лексический анализ)
// ============================================================================

export enum TokenType {
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  COLON = 'COLON',
  SEMICOLON = 'SEMICOLON',
  COMMA = 'COMMA',
  DASH = 'DASH',
  PLUS = 'PLUS',
  GREATER = 'GREATER',
  LESS = 'LESS',
  EQUALS = 'EQUALS',
  NUMBER = 'NUMBER',
  SYMBOL = 'SYMBOL',
  QUOTED_STRING = 'QUOTED_STRING',
  IDENTIFIER = 'IDENTIFIER',
  TIMES = 'TIMES',
  HASH_REF = 'HASH_REF',
  AT_REF = 'AT_REF',
  DOT_REF = 'DOT_REF',
  DOLLAR_REF = 'DOLLAR_REF',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  position: number;
  line: number;
  column: number;
}

export class BaseTokenizer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(input: string) {
    if (input.length > SECURITY_LIMITS.MAX_INPUT_LENGTH) {
      throw new Error(`Input too long: ${input.length} chars`);
    }
    this.input = input;
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
    while (this.currentChar() && /\s/.test(this.currentChar()!)) {
      this.advance();
    }
  }

  private readNumber(): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    while (this.currentChar() && /[0-9]/.test(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    if (this.currentChar() === '.') {
      value += this.currentChar();
      this.advance();
      while (this.currentChar() && /[0-9]/.test(this.currentChar()!)) {
        value += this.currentChar();
        this.advance();
      }
    }

    return { type: TokenType.NUMBER, value, position: startPos, line: startLine, column: startCol };
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
    }

    return { type: TokenType.QUOTED_STRING, value, position: startPos, line: startLine, column: startCol };
  }

  private readIdentifier(): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    if (this.currentChar() && /[a-zA-Z_]/.test(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    while (this.currentChar() && /[a-zA-Z0-9_]/.test(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    return { type: TokenType.IDENTIFIER, value, position: startPos, line: startLine, column: startCol };
  }

  private readRefToken(prefix: string, tokenType: TokenType): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;

    this.advance(); // skip prefix

    let value = '';
    while (this.currentChar() && /[a-zA-Z0-9_]/.test(this.currentChar()!)) {
      value += this.currentChar();
      this.advance();
    }

    if (value.length === 0) {
      throw new Error(`Expected identifier after '${prefix}' at line ${startLine}, column ${startCol}`);
    }

    return { type: tokenType, value, position: startPos, line: startLine, column: startCol };
  }

  private readSymbol(): Token {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;

    const char = this.currentChar();
    if (char) {
      const code = char.charCodeAt(0);
      // Handle surrogate pairs for emojis
      if (code >= 0xD800 && code <= 0xDBFF) {
        this.advance();
        const low = this.currentChar();
        if (low) {
          this.advance();
          return { type: TokenType.SYMBOL, value: char + low, position: startPos, line: startLine, column: startCol };
        }
      }

      this.advance();
      return { type: TokenType.SYMBOL, value: char, position: startPos, line: startLine, column: startCol };
    }

    throw new Error(`Unexpected character at position ${startPos}`);
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.position < this.input.length) {
      this.skipWhitespace();

      if (this.position >= this.input.length) break;

      const char = this.currentChar()!;

      switch (char) {
        case '(': tokens.push({ type: TokenType.LPAREN, value: '(', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case ')': tokens.push({ type: TokenType.RPAREN, value: ')', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case '[': tokens.push({ type: TokenType.LBRACKET, value: '[', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case ']': tokens.push({ type: TokenType.RBRACKET, value: ']', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case ':': tokens.push({ type: TokenType.COLON, value: ':', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case ';': tokens.push({ type: TokenType.SEMICOLON, value: ';', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case ',': tokens.push({ type: TokenType.COMMA, value: ',', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case '-': tokens.push({ type: TokenType.DASH, value: '-', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case '+': tokens.push({ type: TokenType.PLUS, value: '+', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case '>': tokens.push({ type: TokenType.GREATER, value: '>', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case '<': tokens.push({ type: TokenType.LESS, value: '<', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case '=': tokens.push({ type: TokenType.EQUALS, value: '=', position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case '×':
        case 'x':
        case 'X': tokens.push({ type: TokenType.TIMES, value: char, position: this.position, line: this.line, column: this.column }); this.advance(); break;
        case '"':
        case "'":
        case '`': tokens.push(this.readQuotedString(char)); break;
        case '#': tokens.push(this.readRefToken('#', TokenType.HASH_REF)); break;
        case '@': tokens.push(this.readRefToken('@', TokenType.AT_REF)); break;
        case '.': tokens.push(this.readRefToken('.', TokenType.DOT_REF)); break;
        case '$': tokens.push(this.readRefToken('$', TokenType.DOLLAR_REF)); break;
        default:
          if (/[0-9]/.test(char)) {
            tokens.push(this.readNumber());
          } else if (/[a-zA-Z_]/.test(char)) {
            tokens.push(this.readIdentifier());
          } else {
            tokens.push(this.readSymbol());
          }
      }
    }

    tokens.push({ type: TokenType.EOF, value: '', position: this.position, line: this.line, column: this.column });
    return tokens;
  }
}

// ============================================================================
// 2. BASE PARSER (Базовый синтаксический анализ)
// ============================================================================

export class BaseParser {
  protected tokens: Token[];
  protected position: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  protected currentToken(): Token {
    return this.tokens[this.position];
  }

  protected advance(): void {
    if (this.position < this.tokens.length - 1) {
      this.position++;
    }
  }

  protected expect(type: TokenType): Token {
    const token = this.currentToken();
    if (token.type !== type) {
      throw new Error(
        `Expected ${type} but got ${token.type} "${token.value}" at line ${token.line}, column ${token.column}`
      );
    }
    const result = token;
    this.advance();
    return result;
  }

  protected parseGridDimensions(): Vec2 {
    let width: number;
    let height: number;

    if (this.currentToken().type === TokenType.LPAREN) {
      this.advance();
      const firstNum = this.expect(TokenType.NUMBER);
      width = parseInt(firstNum.value, 10);

      if (this.currentToken().type === TokenType.TIMES) {
        this.advance();
        const secondNum = this.expect(TokenType.NUMBER);
        height = parseInt(secondNum.value, 10);
      } else {
        height = width;
      }

      this.expect(TokenType.RPAREN);
    } else {
      const numToken = this.expect(TokenType.NUMBER);
      width = parseInt(numToken.value, 10);
      height = width;
    }

    return { x: width, y: height };
  }

  protected parseGridStyles(): GridStyles {
    const gs: GridStyles = {};
    const params = this.parseParameterValue().split(';');

    for (const param of params) {
      const [key, value] = param.split('=');
      if (!key || !value) continue;

      const trimmedKey = key.trim();
      const trimmedValue = value.trim().replace(/"/g, '');

      if (trimmedKey === 'gc') gs.gc = trimmedValue;
      else if (trimmedKey === 'gb') gs.gb = trimmedValue;
    }

    return gs;
  }

  protected parseTransformVector(): TransformVector {
    const tr: TransformVector = {};
    const params = this.parseParameterValue().split(';');

    for (const param of params) {
      const [key, value] = param.split('=');
      if (!key || !value) continue;

      const trimmedKey = key.trim();
      const trimmedValue = value.trim().replace(/"/g, '');

      switch (trimmedKey) {
        case 'f': tr.f = trimmedValue as 'h' | 'v' | 'hv'; break;
        case 'm': tr.m = parseVec4(trimmedValue); break;
        case 'sp': tr.sp = parseAngleForce(trimmedValue); break;
        case 'w': tr.w = parseAngleForce(trimmedValue); break;
        case 'r': tr.r = parseFloat(trimmedValue); break;
        case 'st': tr.st = parseAngleForce(trimmedValue); break;
      }
    }

    return tr;
  }

  protected parseLayerStyles(): LayerStyles {
    const lc: LayerStyles = {};
    const params = this.parseParameterValue().split(';');

    for (const param of params) {
      const [key, value] = param.split('=');
      if (!key || !value) continue;

      const trimmedKey = key.trim();
      const trimmedValue = value.trim().replace(/"/g, '');

      switch (trimmedKey) {
        case 'c': lc.c = trimmedValue; break;
        case 'b': lc.b = trimmedValue; break;
        case 'bc': lc.bc = trimmedValue; break;
        case 'bb': lc.bb = trimmedValue; break;
      }
    }

    return lc;
  }

  protected parseParameterValue(): string {
    let value = '';
    const token = this.currentToken();

    if (token.type === TokenType.QUOTED_STRING) {
      value = token.value;
      this.advance();
    } else if (token.type === TokenType.IDENTIFIER && /^(hsl|hsla|rgb|rgba)$/i.test(token.value)) {
      // CSS function like hsl(...), rgb(...)
      let funcStr = token.value;
      this.advance();

      if (this.currentToken().type === TokenType.LPAREN) {
        let depth = 0;
        while (this.currentToken().type !== TokenType.EOF) {
          const t = this.currentToken();
          if (t.type === TokenType.LPAREN) depth++;
          else if (t.type === TokenType.RPAREN) {
            depth--;
            if (depth === 0) {
              funcStr += t.value;
              this.advance();
              break;
            }
          }
          funcStr += t.value;
          this.advance();
        }
      }
      value = funcStr;
    } else {
      // Read until ; or ]
      while (
        this.currentToken().type !== TokenType.SEMICOLON &&
        this.currentToken().type !== TokenType.RBRACKET &&
        this.currentToken().type !== TokenType.EOF
      ) {
        value += this.currentToken().value;
        this.advance();
      }
    }

    return value.trim();
  }

  /** Parse DeltaOp: =, +=, -=, >=, <= */
  protected parseDeltaOp(): { op: DeltaOp; hasOp: boolean } {
    const token = this.currentToken();
    
    if (token.type === TokenType.DASH && this.position + 1 < this.tokens.length && this.tokens[this.position + 1].type === TokenType.EQUALS) {
      this.advance(); this.advance();
      return { op: '-=', hasOp: true };
    }
    if (token.type === TokenType.PLUS && this.position + 1 < this.tokens.length && this.tokens[this.position + 1].type === TokenType.EQUALS) {
      this.advance(); this.advance();
      return { op: '+=', hasOp: true };
    }
    if (token.type === TokenType.GREATER && this.position + 1 < this.tokens.length && this.tokens[this.position + 1].type === TokenType.EQUALS) {
      this.advance(); this.advance();
      return { op: '>=', hasOp: true };
    }
    if (token.type === TokenType.LESS && this.position + 1 < this.tokens.length && this.tokens[this.position + 1].type === TokenType.EQUALS) {
      this.advance(); this.advance();
      return { op: '<=', hasOp: true };
    }
    if (token.type === TokenType.EQUALS) {
      this.advance();
      return { op: '=', hasOp: true };
    }
    
    return { op: '=', hasOp: false };
  }

  protected parseSymbol(): BaseSymbol {
    const token = this.currentToken();
    let v: string | undefined;

    // Parse content prefix
    if (token.type === TokenType.HASH_REF) {
      v = `#${token.value}`;
      this.advance();
    } else if (token.type === TokenType.AT_REF) {
      v = `@${token.value}`;
      this.advance();
    } else if (token.type === TokenType.DOT_REF) {
      v = `.${token.value}`;
      this.advance();
    } else if (token.type === TokenType.DOLLAR_REF) {
      v = `$${token.value}`;
      this.advance();
    } else if (token.type === TokenType.QUOTED_STRING) {
      v = `"${token.value}"`;
      this.advance();
    } else if (token.type === TokenType.SYMBOL || token.type === TokenType.IDENTIFIER) {
      v = token.value;
      this.advance();
    }

    const sym: BaseSymbol = { v, d: { start: 0, end: 0 } };

    // Parse parameters [...]
    if (this.currentToken().type === TokenType.LBRACKET) {
      this.advance();

      while (this.currentToken().type !== TokenType.RBRACKET && this.currentToken().type !== TokenType.EOF) {
        const keyToken = this.currentToken();
        if (keyToken.type !== TokenType.IDENTIFIER) {
          this.advance();
          continue;
        }

        const key = keyToken.value.toLowerCase();
        this.advance();
        
        // Parse DeltaOp for animation/history blocks
        const { op, hasOp } = this.parseDeltaOp();
        if (!hasOp && this.currentToken().type !== TokenType.EQUALS) {
          // No operator, expect plain =
          this.expect(TokenType.EQUALS);
        }

        const value = this.parseParameterValue();

        switch (key) {
          case 'id': sym.id = value; break;
          case 'class': sym.class = value; break;
          case 'n': sym.n = value; break;
          
          // Geometry — ВСЕ используют parseBounds (start-end формат)
          case 'd': sym.d = parseBounds(value); break;
          case 'pg': sym.pg = parseBounds(value); break;  // Только редактор
          case 'po': sym.po = parseBounds(value); break;  // Только редактор
          case 'l': sym.l = parseInt(value, 10); break;
          case 'z': sym.z = parseInt(value, 10); break;
          
          // Transforms
          case 'tr': sym.tr = this.parseTransformVector(); break;
          case 'f': sym.tr = { ...sym.tr, f: value as 'h' | 'v' | 'hv' }; break;
          case 'm': sym.tr = { ...sym.tr, m: parseVec4(value) }; break;
          case 'sp': sym.tr = { ...sym.tr, sp: parseAngleForce(value) }; break;
          case 'w': sym.tr = { ...sym.tr, w: parseAngleForce(value) }; break;
          case 'r': sym.tr = { ...sym.tr, r: parseFloat(value) }; break;
          case 'st': sym.tr = { ...sym.tr, st: parseAngleForce(value) }; break;
          
          // Styles
          case 'lc': sym.lc = this.parseLayerStyles(); break;
          case 'c': sym.lc = { ...sym.lc, c: value }; break;
          case 'b': sym.lc = { ...sym.lc, b: value }; break;
          case 'bc': sym.lc = { ...sym.lc, bc: value }; break;
          case 'bb': sym.lc = { ...sym.lc, bb: value }; break;
          
          // 3D Space
          case 'vp': sym.vp = parseVec3(value); break;
          case 'zd': sym.zd = parseVec3(value); break;
          case 'zi': sym.zi = parseInt(value, 10); break;
          
          // Animation (k, t, p) — DeltaOp применяется к значениям
          case 'k': /* индекс кадра, не дельта */ break;
          case 't': /* время, не дельта */ break;
          case 'p': /* play state, не дельта */ break;
        }

        if (this.currentToken().type === TokenType.SEMICOLON) {
          this.advance();
        }
      }

      this.expect(TokenType.RBRACKET);
    }

    // Parse final bounds (start-end) — обязательный финальный элемент
    const startToken = this.expect(TokenType.NUMBER);
    this.expect(TokenType.DASH);
    const endToken = this.expect(TokenType.NUMBER);

    sym.d = {
      start: parseInt(startToken.value, 10),
      end: parseInt(endToken.value, 10)
    };

    return sym;
  }

  parse(): BaseSpec {
    const grid = this.parseGridDimensions();
    let gs: GridStyles | undefined;

    // Parse grid styles [...]
    if (this.currentToken().type === TokenType.LBRACKET) {
      this.advance();
      gs = this.parseGridStyles();
      this.expect(TokenType.RBRACKET);
    }

    this.expect(TokenType.COLON);

    const symbols: BaseSymbol[] = [];

    while (this.currentToken().type !== TokenType.EOF) {
      if (this.currentToken().type === TokenType.SEMICOLON) {
        this.advance();
        continue;
      }

      const symbol = this.parseSymbol();
      symbols.push(symbol);

      if (this.currentToken().type === TokenType.SEMICOLON) {
        this.advance();
      }
    }

    return {
      grid: { g: grid },
      symbols,
      version: '1.0'
    };
  }
}

// ============================================================================
// 3. SERIALIZATION (Базовая сериализация для экспорта)
// ============================================================================

export function serializeBaseSpec(spec: BaseSpec, mode: ParserMode = 'export'): string {
  const parts: string[] = [];

  // Grid dimensions
  if (spec.grid.g) {
    parts.push(`(${spec.grid.g.x}×${spec.grid.g.y})`);
  }

  // Grid styles
  if (spec.grid.g) {
    const gsParts: string[] = [];
    if (spec.grid.g) gsParts.push(`g=${spec.grid.g.x},${spec.grid.g.y}`);
    if (mode === 'editor' && spec.grid.pg) gsParts.push(`pg=${spec.grid.pg.start}-${spec.grid.pg.end}`);
    parts.push(`[${gsParts.join(';')}]`);
  }

  parts.push(':');

  // Symbols
  for (const sym of spec.symbols) {
    const symParts: string[] = [];

    if (sym.v) symParts.push(sym.v);

    const params: string[] = [];
    if (sym.id) params.push(`id=${sym.id}`);
    if (sym.class) params.push(`class=${sym.class}`);
    if (sym.n) params.push(`n=${sym.n}`);
    if (sym.d) params.push(`d=${sym.d.start}-${sym.d.end}`);
    
    // pg/po только для режима редактора
    if (mode === 'editor') {
      if (sym.pg) params.push(`pg=${sym.pg.start}-${sym.pg.end}`);
      if (sym.po) params.push(`po=${sym.po.start}-${sym.po.end}`);
    }
    
    if (sym.l !== undefined) params.push(`l=${sym.l}`);
    if (sym.z !== undefined) params.push(`z=${sym.z}`);

    if (params.length > 0) {
      symParts.push(`[${params.join(';')}]`);
    }

    symParts.push(`${sym.d.start}-${sym.d.end}`);
    parts.push(symParts.join(''));
  }

  return parts.join('');
}

// ============================================================================
// 4. PUBLIC API (Публичный API)
// ============================================================================

export function parseBaseSpec(input: string, mode: ParserMode = 'export'): BaseSpec {
  // Remove comments
  const lines = input.split('\n').filter(line => !isCommentLine(line.trim()));
  const cleanInput = lines.join('\n');

  const tokenizer = new BaseTokenizer(cleanInput);
  const tokens = tokenizer.tokenize();
  const parser = new BaseParser(tokens);
  return parser.parse();
}

export function detectUniFormat(input: string): UniFormat {
  return detectFormat(input);
}

export { SECURITY_LIMITS };