/**
 * ============================================================================
 * UniComp Core Types v1.0
 * ============================================================================
 * Общие интерфейсы для всех 9 форматов парсеров.
 * Основано на спецификации UniComp v1.0 (log.txt)
 * 
 * Ключевая модель:
 * - grid = объединённые bounds всех слоёв
 * - pg = якорь первичной сетки (движется с расширением grid)
 * - po = смещение слоя относительно pg
 * - d = pg + po (финальные координаты после "запекания")
 * 
 * УДАЛЕНО: me, se, el, et, hl, ht, o, s, debt-логика, DeltaOp
 * 
 * Импорт:
 *   import { Vec2, BaseSymbol, BaseSpec } from '../unicomp-core/types';
 * 
 * Вес: ~3 KB (minified + gzip)
 * ============================================================================
 */

// ============================================================================
// 1. БАЗОВЫЕ ВЕКТОРЫ (Geometric Primitives)
// ============================================================================

/** 2D вектор: координаты, размеры, смещения */
export interface Vec2 {
  x: number;
  y: number;
}

/** 3D вектор: для перспективы, осей, смещения в пространстве */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 4D вектор: отступы [top, right, bottom, left] */
export interface Vec4 {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Границы слоя в линейной сетке [start, end] */
export interface Bounds {
  start: number;
  end: number;
}

// ============================================================================
// 2. ТРАНСФОРМАЦИИ (tr-вектор / Visual Actors)
// ============================================================================
/**
 * Визуальные искажения, не влияющие на геометрию сетки.
 * Рендерятся на WebGL, живут внутри Layer Box.
 * Порядок применения: f → m → sp → w → r → st
 */
export interface TransformVector {
  /** f= Flip: отражение по осям ('h' | 'v' | 'hv') */
  f?: 'h' | 'v' | 'hv';
  
  /** m= Margin: внутренние отступы фигуры в слое */
  m?: Vec4;
  
  /** sp= Parallelogram: наклон/скос параллелограмма [angle, force] */
  sp?: { angle: number; force: number };
  
  /** w= Warp: нелинейное искривление (стягивание/раздутие) [angle, force] */
  w?: { angle: number; force: number };
  
  /** r= Rotation: поворот в градусах */
  r?: number;
  
  /** st= Trapezoid: перспективная трапеция [angle, force] */
  st?: { angle: number; force: number };
}

// ============================================================================
// 3. СТИЛИ (lc-вектор и gs-вектор / Material Actors)
// ============================================================================

/**
 * Стили слоя и содержимого: 4 канала.
 * Формат значений: HSLA + дополнительные параметры (width, radius)
 */
export interface LayerStyles {
  /** c= Symbol Color: цвет и прозрачность контента (HSLA + radius) */
  c?: string;
  
  /** b= Symbol Border: ширина, цвет, прозрачность границы символа (HSLA + width) */
  b?: string;
  
  /** bc= Layer Background: цвет заливки, прозрачность, радиус скругления (HSLA + radius) */
  bc?: string;
  
  /** bb= Layer Border: ширина, цвет, прозрачность границы слоя (HSLA + width) */
  bb?: string;
}

/** Стили сетки: фон и рамка */
export interface GridStyles {
  /** gc= Grid Background (HSLA + radius) */
  gc?: string;
  
  /** gb= Grid Border (HSLA + width) */
  gb?: string;
}

// ============================================================================
// 4. АНИМАЦИЯ (Sequence Playback)
// ============================================================================

/** Состояния воспроизведения (p=) */
export const PLAY_STATES = {
  STATIC_START: 0,      // '0' — пауза на первом кадре
  STATIC_END: 1,        // '1' — пауза на последнем
  FORWARD: 2,           // '01' — проигрывание вперёд
  REVERSE: 3,           // '10' — проигрывание назад
  PING_PONG: 4,         // '010' — цикл туда-обратно
  REVERSE_PING: 5,      // '101' — цикл от конца
  CLEAR_DROP_FIRST: 6,  // '100' — удалить очередь, оставить первый
  CLEAR_DROP_LAST: 7,   // '001' — удалить очередь, оставить последний
  DELETE: 8,            // '000' — удалить слой (GC)
} as const;

export type PlayState = typeof PLAY_STATES[keyof typeof PLAY_STATES];

/** Кадр анимации */
export interface Keyframe {
  /** k= Индекс кадра */
  k: number;
  
  /** t= Длительность в секундах */
  t: number;
  
  /** p= Состояние воспроизведения */
  p: PlayState;
  
  /** Изменения стилей для этого кадра */
  lc?: LayerStyles;
  
  /** Изменения трансформаций для этого кадра */
  tr?: TransformVector;
  
  /** Изменения геометрии для этого кадра (pg, po) */
  pg?: Bounds;
  po?: Bounds;
}

// ============================================================================
// 5. 3D ПРОСТРАНСТВО (Pseudo-3D / Cube Faces)
// ============================================================================

/** Индексы сторон куба для .uni3ds */
export const CUBE_FACES = {
  FRONT: 0,
  RIGHT: 1,
  LEFT: 2,
  TOP: 3,
  BOTTOM: 4,
  BACK: 5,
} as const;

export type CubeFace = typeof CUBE_FACES[keyof typeof CUBE_FACES];

/** Параметры 3D-пространства */
export interface Space3D {
  /** vp= Сдвиг от центра и глубина перспективы [x, y, z] */
  vp?: Vec3;
  
  /** zd= Матрица осей и отражений [top, bottom, flip] */
  zd?: Vec3;
  
  /** zi= Индекс стороны куба (0-5) */
  zi?: CubeFace | number;
}

// ============================================================================
// 6. КОНТЕНТ (Content Prefixes)
// ============================================================================

export const CONTENT_PREFIX = {
  QUOTED: '"',   // Прямой текст: "А"
  REF_ID: '#',   // Ссылка по ID: #sharik
  REF_NAME: '@', // Семантический псевдоним: @main_button
  REF_CLASS: '.',// Групповой класс: .highlight
  REF_SRC: '$',  // Внешний ресурс: $/img/icon.svg
} as const;

export type ContentPrefix = typeof CONTENT_PREFIX[keyof typeof CONTENT_PREFIX];

// ============================================================================
// 7. БАЗОВЫЙ СИМВОЛ (BaseSymbol / Minimum for any format)
// ============================================================================

/**
 * BaseSymbol — ядро любого слоя.
 * Содержит только то, что нужно для рендера.
 * Не включает: историю (h=), аффинные якоря (pg/po) —
 * это добавляется в специализированных парсерах.
 */
export interface BaseSymbol {
  // === Идентификация ===
  /** v= Payload: символ, #id, @name, $src или текст */
  v?: string;
  
  /** Уникальный идентификатор для ссылок */
  id?: string;
  
  /** Групповой класс для общих стилей */
  class?: string;
  
  /** Семантический псевдоним (@name) */
  n?: string;

  // === Геометрия (обязательно после "запекания") ===
  /** d= Финальные координаты [start, end] в линейной сетке */
  d: Bounds;
  
  /** l= Индекс слоя (глобальная последовательность) */
  l?: number;
  
  /** z= Индекс плоскости/группы слоёв */
  z?: number;

  // === Визуальные трансформации ===
  /** tr= Вектор трансформаций фигуры */
  tr?: TransformVector;

  // === Стили ===
  /** lc= Вектор стилей слоя и контента */
  lc?: LayerStyles;

  // === 3D-пространство (опционально) ===
  /** vp= Сдвиг от центра и глубина перспективы */
  vp?: Vec3;
  
  /** zd= Матрица осей и отражений */
  zd?: Vec3;
  
  /** zi= Индекс стороны куба */
  zi?: CubeFace | number;
}

// ============================================================================
// 8. БАЗОВАЯ СПЕЦИФИКАЦИЯ (BaseSpec / Minimum for any format)
// ============================================================================

/**
 * BaseSpec — минимальная структура сцены.
 * Подходит для статических форматов (.unipng, .uniasc, .uniai).
 */
export interface BaseSpec {
  /** g= Размер сетки [width, height] */
  grid?: { g?: Vec2 };
  
  /** Список слоёв */
  symbols: BaseSymbol[];
  
  /** Исходная строка (для отладки/сериализации) */
  raw?: string;
  
  /** Версия спецификации */
  version?: string;
}

// ============================================================================
// 9. РЕДАКТОР (EditorSymbol / EditorSpec / Process State)
// ============================================================================

/**
 * Расширение базового символа для редактора (.unicomp).
 * Включает аффинные параметры и историю.
 * НЕ сериализуется в статические форматы без bake().
 */
export interface EditorSymbol extends BaseSymbol {
  /** pg= Якорь первичной сетки (только в редакторе) */
  pg?: Bounds;
  
  /** po= Относительное смещение к pg (только в редакторе) */
  po?: Bounds;
  
  /** keyframes= Кадры анимации */
  keyframes?: Keyframe[];
}

/** Расширенная спецификация для редактора */
export interface EditorSpec extends BaseSpec {
  grid: {
    g?: Vec2;
    pg?: Bounds;   // Только редактор
    gs?: GridStyles;
  };
  symbols: EditorSymbol[];
}

// ============================================================================
// 10. УТИЛИТЫ ТИПОВ (Type Utilities)
// ============================================================================

/** Тип для "запечённого" символа (без истории, без pg/po) */
export type BakedSymbol = Omit<BaseSymbol, 'd'> & {
  d: Bounds; // d обязательно
};

/** Тип для "запечённой" спецификации (экспорт в .unipng, .uniai) */
export type BakedSpec = Omit<BaseSpec, 'symbols'> & {
  symbols: BakedSymbol[];
};

/** Режим парсера */
export type ParserMode = 'editor' | 'export' | 'stream';

/** Тип формата UniComp */
export type UniFormat = 
  | 'unicomp'  // Полный редактор
  | 'unipng'   // Статика цвет
  | 'unigif'   // Анимация кадров
  | 'unimpg'   // Полный плеер
  | 'unistr'   // Потоковый
  | 'uni3ds'   // 3D куб
  | 'unilib'   // Библиотека
  | 'uniai'    // AI-роутер
  | 'uniasc';  // Монохром

// ============================================================================
// ЭКСПОРТ ДЛЯ УДОБСТВА
// ============================================================================

export type {
  Vec2, Vec3, Vec4, Bounds,
  TransformVector, LayerStyles, GridStyles,
  Keyframe, Space3D,
  BaseSymbol, BaseSpec, BakedSymbol, BakedSpec,
  EditorSymbol, EditorSpec,
  ParserMode, UniFormat
};

export {
  PLAY_STATES,
  CUBE_FACES,
  CONTENT_PREFIX
};