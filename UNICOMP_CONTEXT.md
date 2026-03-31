# UniComp — AI Agent Context File
> **Читай цей файл першим.** Повний контекст проекту для AI-агентів. Переноситься разом з репозиторієм.
> Актуально: 2026-03 | Верифіковано по реальному коду

---

## 1. Що таке UniComp

**UniComp** — детермінована текстова система для опису багатошарових графічних сцен на сітці. Ключова ідея: _одна функція замінює тисячі символів_. Символи (гліфи, емодзі, SVG, ієрогліфи) розміщуються на сітці та трансформуються текстовими правилами.

**Стратегічні цілі:**
1. **2.5D / псевдо-паралакс** — опис глибини через Z-шари та перспективні трансформації
2. **Навчання AI** — текстові описи компоновок для обміну між мовними та графічними моделями
3. **CSS-подібне вбудовування** — готові анімації вставляються на сайти як `<unicomp>` web component
4. **Кубічні сцени** — 6 граней куба з 6 площин, псевдо-3D без WebGL сцени
5. **AI ↔ Human** — розробник пише текст, AI розуміє глибину/форму/рух

---

## 2. Специфікація UniComp v1.0 (Повна таблиця параметрів)

# UniComp Specification (v1.0)

## 2.1. Parameter Registry

| Код | Имя | Тип | Исходно | Описание |
| :-- | :-- | :-- | :------ | :------- |
| `g` | Grid Space | `ivec2` | required[`width`, `hight`] | Размер поля |
| `pg` | Primary Grid | `ivec2` | required[`start`, `end`] | primary grid with a relative offset to itself for histoty |
| `d` | Bounds | `ivec2` | required[`start`, `end`] | Финальный адрес ячеек [`start`, `end`] |
| `po` | Primary Offset | `ivec2` | [`start`, `end`] | primary offset laers after move or scale for hostory |
| `v` | Payload | `string` | required[`symbols`|`#id`|`@name`|`$src`] | Контент: символ, текст, путь к SVG или ссылка. |
| `id` | Identifier | `string` | `none` | Уникальный ID объекта для ссылок (`#id`). |
| `f` | Flip | `int` | `0` | Отражение: bitmask (0: none, 1: `h`, 2: `v`, 3: `hv`). |
| `m` | Margin | `vec4` | [`0px`, `0px`, `0px`, `0px`] Внутренние отступы [top, left, bottom, right]. |
| `sp` | Parallelogram | `vec2` | [`0°`, `1`] | Перспектива (трапеция). 1. r:∡[0<-|1|->2] или так r: 0 ⇥ (1) ↦ 2 Поворот  двухнаправленным переключателем ползуноком, вращение инструмента вокруг относитпльно статического холста. 2. Ползунок переключатель направления и силы 0<-1->2 X[1->0] tpggle and force Y[1->2] |
| `w` | Warp | `vec2` | [`0°`, `1`] | Нелинейное искривление. 1. r:∡[0<-|1|->2] или так r: 0 ⇥ (1) ↦ 2 Поворот  двухнаправленным переключателем ползуноком, вращение инструмента вокруг относитпльно статического холста. 2. Ползунок переключатель направления и силы 0<-1->2 Hourglass[1->0] tpggle and force Sphere[1->2] |
| `r` | Rotation | `float` | [`0°`] | Угол поворота в градусах. |
| `st` | Trapezoid | `vec2` | [`0°`, `1`] | Искажение (параллелограмм). 1. r:∡[0<-|1|->2] или так r: 0 ⇥ (1) ↦ 2 Поворот  двухнаправленным переключателем ползуноком, вращение инструмента вокруг относитпльно статического холста. 2. Ползунок переключатель направления и силы 0<-1->2  flipPerpendicularToTheSlider[1->0] tpggle and force flipPerpendicularToTheSlider[1->2] |
| `tr` | Figure Transformations | `struct` | [`f`, `m`, `sp`, `w`, `r`, `st`] |  Перечень трансформаций фигуры/символа/изображения |
| `c` | Figure/Symbol Color | `struct` | [`0`, `0%`, `0%`, `0`, `0°`] | vec4[`hsla`]+vec2[`r`] Цвет и детализация скругление символа исходя из radius заданном в width параметоа `b`. |
| `b` | Figure/Symbol Border | `struct` | [`0`, `0%`, `0%`, `0`, `0px`] | vec4[`hsla`]+float[`w`] Цвет и толщина обводки символа. |
| `bc` | Layer Color | `struct` | [`0`, `0%`, `0%`, `0`, `0°`] | vec4[`hsla`]+vec2[`r`] Цвет заливки фона слоя. |
| `bb` | Layer Border | `struct` | [`0`, `0%`, `0%`, `0`, `0px`] | vec4[`hsla`]+float[`w`] Обводка контейнера слоя. |
| `ls` | Layer and Figure Colors | `UBO` | std140[`c`, `b`, `bc`, `bb`] | Перечень раскраски слоя и его содержимого |
| `gc` | Grid Color | `struct` | [`0`, `0%`, `0%`, `0`, `0°`] | vec4[`hsla`]+vec2[`r`] Фоновый цвет основной сетки. |
| `gb` | Grid Border | `struct` | [`0`, `0%`, `0%`, `0`, `0px`] | vec4[`hsla`]+float[`w`] Параметры внешних границ сетки. |
| `gs` | Grid Colors | `ubo`| std140[`gc`, `gb`] | Перечень раскраски пространства сетки |
| `k` | Keyframe | `int` | `0` | Порядковый номер кадра анимации. |
| `p` | Play State | `int` | `0` | Режим плеера bitmask(0: `0`, 1: `1`, 2: `01`, 3: `01`, 4: `101`, 5: `010`, 6: `100`, 7: `001`, 8: `000`). |
| `t` | Time | `float` | `1.0` | Длительность интерполяции кадра. |
| `l` | Layer | `int` | `required[serial numbe]` | Определяется порядком блока в строке, обязателен но генерируется автоматически. `l` и `z` переопределяют порядок друг друга автоматически, если пользователь меняет порядок одного или другого. |
| `z` | Plane/Layer Group | `int` | `0` | Индекс задается пользователем, присваивается слоям как неразрывной последовательности слоёв. при присвоении параметра z= автоматически пересчитывается l= и переносит блок в текстовом правиле на новую layer позицию|

---

### 2.7 Play States (для p=)
| Код | Стан | Опис |
|:----|:-----|:-----|
| `0` | Static Start | Пауза на першому кадрі |
| `1` | Static End | Пауза на останньому кадрі |
| `01` | Forward | Одноразове відтворення |
| `10` | Reverse | Одноразове у зворотній бік |
| `010` | Ping-Pong | Цикл туди-назад (Yo-Yo) |
| `101` | Reverse Ping-Pong | Цикл від кінця |
| `100` | Clear/Drop | Видалити чергу, крім першого кадру |
| `001` | Clear/Drop | Видалити чергу, крім останнього |
| `000` | Delete | Видалити весь шар (GC) |
 
---

## 3. Синтаксис UniComp (Grammar)

### 3.1 Базова структура рядка
```
(W×H)[pg_params]:layer1[d=start end][po=start end];layer2[d=start end][po=start end];...;layerN[d=start end][po=start end]
```
- `(W×H)` — розмір сітки (також `(N)` для квадратної)
- `[...]` — блок параметрів (ключ=значення через `;`)
- `:` — розділювач між заголовком та шарами
- шари розділяються `;`

### 3.2 Статичний шар (Baked format)
```
"символ"[param=val;param=val]start-end
```
Приклади:
```
H5-98                    — символ H, комірки 5-98
"🫢"55-99               — емодзі, комірки 55-99
"A"[r=45;c=red]0-15     — A, повернуто 45°, червоний
"|"[r=90;sp=45,30]10-50 — вертикальна лінія, зсув
"★"[c=hlsa(0, 0%, 0%, 1), 0;r=0]20-35  — зірка, золотий, 80% opacity
```

### 3.3 Динамічний шар (Editor / Streaming)

Editor
```
#id"символ"[d=stsrt,end][po=start,end][tr params][lc params][h=...,]start-end
```

Streaming
```
[v="simbol|#id|$src",d="start-end"][tr params][lc params][k=n;t=s;p=0];  // Layer1
[v="symbol|#id|$src",d="start-end"][tr params][lc params][k=n;t=s;p=010];  // Layer2
[v="symbol|#id|$src",d="start-end"][tr params][lc params][k=n;t=s;p=101];  // Layer3
...
[v="symbol|#id|$src",d="start-end"][tr params][lc params][k=n;t=s;p=001];  //LayerN
```

### 3.4 Delta-операції
```
r=45     — абсолютне присвоєння
r+=45    — відносна дельта (додати)
r-=45    — відносна дельта (відняти)
r>=45    — відносна дельта (покадрово додавати)
r<=45    — відносна дельта (покадрово віднімати)
```

### 3.5 Multi-line
```
(10×10):A0-99
(20×20):B0-399
// Кожен рядок — окрема UniCompSpec
```

### 3.6 Коментарі
```
# shell-style comment
// JS/C++ comment
/* block comment */
-- SQL/Lua comment
```

---

diff_расширения - когда передвигаемые слой, область выделения группы слоёв, её начало или конец, верх, низ, лево или право, меньше 0 лева и верха или больше размера сетки права и низа grid поля, добавление сдвига и пересчет пространства происходит каждые 200-300 сдвиг на + 1 клетку расширения пространства Grid Space:

d(start, end) = pg(start, end) + po(start, end)

po(start, end) = d(start, end) - pg(start, end)

pg(start, end) = pg₀(start, end) + diff_расширения(start, end)

---

## 4. Архітектура рендерингу (11 шарів)

Строгий порядок малювання:

**Група 1 — Grid Renderer:**
1. Grid Background (`gc`) — заливка всього поля
2. Grid Border (`gb`) — зовнішня рамка полотна
3. Grid Lines — лінії сітки
4. Cell Index Labels — порядкові номери (тільки редактор)

**Група 2 — Layer Renderer (для кожного символу в порядку Z):**
5. Layer Background (`bc`) — заливка прямокутника шару з borderRadius
6. Layer Border (`bb`) — обведення контейнера (після `bc`)

**Група 3 — Symbol Renderer:**
7. Symbol Face (`v` + `c`) — вміст символу з кольором та трансформаціями
8. Symbol Border (`b`) — GPU post-process обведення (mode=3)
9. Special Effects — WebGL фільтри
10. Alpha Correction — інвертована alpha-маска

**Порядок Z-шарів:** менший `z` = далі (малюється першим).

---

## 5. GPU Rendering Pipeline (SuperTransformer.ts — Ultimate Edition WebGL2)

> **Версія**: WebGL2 "Ultimate Edition" — 2008 рядків | Контекст: `webgl2` (VAO, instancing нативні)

### Чотири шейдерні програми
| Програма | Призначення |
|:---------|:------------|
| `fixedProgram` | Фіксований порядок трансформацій (зворотна сумісність) |
| `dynamicProgram` | Довільний порядок через `TransformStep[]` |
| `blobProgram` | Векторні обводки (кружки через `gl_VertexID`) |
| `instancedProgram` | Масовий рендер для плеєра |

### Можливості шейдерів
| Можливість | Опис |
|:-----------|:-----|
| **FillType** | `'solid' \| 'gradient' \| 'texture'` |
| **Gradient** | Лінійний градієнт за кутом: startColor → endColor |
| **Texture** | repeat/mirror/clamp, scaleX/Y, offsetX/Y, rotation, mirrorX/Y |
| **SDF Mask** | CSG: union/intersect/subtract/subtract-rev |
| **Shadow** | Зовнішня/внутрішня тінь: angle, distance, blur, color |
| **TransformStep[]** | flip→margin→skew→rotateSkew→warp→rotateWarp→rotateFinal→perspective→rotatePerspective |

«Забудь про стандартные ползунки. Реализуй Radial Vector Controller для инструментов трансформации sp, w, st:

    Input: CenterPoint (CP) и TouchPoint (TP).
    Vector Calculation:
        Angle = atan2(TP.y - CP.y, TP.x - CP.x) — это угол разворота самого инструмента трансформации.
        Force = distance(CP, TP) / MaxRadius — это амплитуда.
    Logic Gate (Toggle):
        Если Force < 1.0, активируй режим A (например, Hourglass), где Intensity = 1.0 - Force.
        Если Force > 1.0, активируй режим B (например, Sphere), где Intensity = Force - 1.0.
    Output: Передай Angle и Intensity в шейдер как uniform vec2.»

# UniComp Core Rules (DO NOT VIOLATE):
1. **Render Order**: Grid -> ls (bc THEN bb) -> tr (Mirror) -> lc (v, c, b). NEVER put bb after symbol.
2. **Transforms (tr)**: strictly deterministic stack: f -> m -> sp -> w -> r -> st.
3. **Geometry**: Only use 'd' [start[x1,y1],end[x2,y2]]. No 'rect' or 'circle' primitives.
4. **No Overengineering**: Use simple vectors/arrays, no complex nested objects.


### Публічний API
```typescript
interface UniCompScene {
  // 1. GRID LEVEL (g, gs)
  g: { start: namber; end: number }
  pg: { start: namber; end: number } // пересчитывается при каждом применении scale или move если производился пересчёт сдвигов и расширения или сужения пространства поля,или же при откате истории и удалении пустот пространства сверху и слева.
  gs: {
    gc: string;                     // Слой 1: Grid Background (HSLA)
    gb: string;                     // Слой 2: Grid Border (width, color)
    lines?: { c: string; w: number }; // Слой 3: Линии сетки
    labels?: boolean;               // Слой 4: Номера ячеек
  };

  // 2. LAYER LEVEL (переписать этот раздел, зесь афинные простоанства и преобразования слоёв поддерживающие отрицательные и положительные смещения относительно первичной сетки пространства поля pg, невидимый слой который ведет себя как остальные невыделенные слои и пассивно смещается относительно нового расширяемого или сужаемого пространства Grid Space)
  

    // LAYER STYLE (ls) - "Коробка"
    ls: {
      bc: string;                   // Слой 5: Layer Background
      bb: string;                   // Слой 6: Layer Border (СТРОГО ПОСЛЕ bc)
    };

    // TRANSFORM VECTOR (tr) - "Кривое зеркало" для Symbol
    // Применяется только к группе lc, не трогает d и ls
    tr: {
      f?: string;                   // 0: Flip
      m?: number[];                 // 1: Margin [t, l, b, r]
      sp?: [number, number];        // 2: Parallelogram (angle, force)
      w?: [number, number];         // 3: Warp (angle, force)
      r?: number;                   // 4: Rotation
      st?: [number, number];        // 5: Trapezoid (angle, force)
    };

    // LAYER CONTENT (lc) - "Жилець"
    lc: {
      v: string;                    // Payload (символ, #id или $svg)
      c: string;                    // Слой 7: Symbol Face (Color)
      b: string;                    // Слой 8: Symbol Border (Post-process)
    };
  }>;
}

```

### Нові інтерфейси (ПОВНІСТЮ ЗМІНЕНІ від попередньої версії)
```typescript
interface UniCompCore {
  // ПАРСИНГ: Из строки в типизированный объект (Streaming -> Logic)
  parse(raw: string): UniCompScene;

  bake(scene: UniCompScene): UniCompScene;

  // РЕНДЕРИНГ: Последовательная отрисовка 11 слоев
  // 1. (Рисует grid) (g)[gs] || [g,gs]: 2. (Цикл по layer) (v)[(ls -> apply tr -> lc)](d) || [v, d, (ls -> apply tr -> lc)]
  render(scene: UniCompScene, canvas: HTMLCanvasElement): void;

  // ШЕЙДЕРНЫЙ КОНТРОЛЛЕР: Тот самый векторный "ползунок"
  // Принимает координаты касания и выдает значения для вектора tr
  calculateTransform(center: Point, touch: Point): { angle: number; force: number };
}
```

### Внутрішні алгоритми
- **SDF** — `sdfCircle`, `sdfRoundedBox` у шейдері для масок і форм
- **Blob shader** — `gl_VertexID` (WebGL2) для інстансингу кружків
- **Douglas-Peucker** — спрощення контурів (simplifyEpsilon)
- **Chaikin smoothing** — згладжування контурів (smoothIterations)
- **Render cache** — Map<string, HTMLCanvasElement>, max **200** елементів (LRU)
- **Texture cache** — Map<string, WebGLTexture>
- **VAO** — quadVAO, instanceBuffer (нативні об'єкти WebGL2)

---

## 6. Структура файлів (з точними розмірами)

```
/                                 ~10834 рядків TypeScript/React
├── UNICOMP_CONTEXT.md            <- ЦЕЙ файл (AI context, головний)
├── replit.md                     <- короткий індекс для Replit Agent
├── src/
│   ├── lib/
│   │   ├── unicomp-parser.ts     2598 рядків — Secure Parser v5.0 + DoS-захист + bake()
│   │   ├── SuperTransformer.ts   2008 рядків — WebGL2 Ultimate Edition
│   │   ├── render-utils.ts        490 рядків — 2D canvas рендер (виклики deprecated!)
│   │   ├── animation-engine.ts    276 рядків — keyframe рушій
│   │   ├── i18n.ts                405 рядків — локалізація (EN, RU)
│   │   ├── transform-tools.ts     133 рядків — жести → параметри трансформації
│   │   ├── UniCompCore.ts          ~80 рядків — baking + play state + renderUniComp()
│   │   └── utils.ts                 6 рядків — cn(), загальні утиліти
│   ├── components/
│   │   ├── UniCompRenderer.tsx   1393 рядків — Canvas + інтерактивне редагування
│   │   ├── GridVisualizationPanel.tsx  532 рядків — Live preview + анімація + export
│   │   ├── ColorStrokePanel.tsx   448 рядків — UI панель кольору/обведення (c,b,bc,bb)
│   │   ├── SpecificationPanel.tsx 459 рядків — Інспектор властивостей символу
│   │   ├── FormatReference.tsx    265 рядків — Довідка по синтаксису
│   │   ├── CodeEditor.tsx         226 рядків — Текстовий редактор
│   │   ├── ExamplePresets.tsx     151 рядків — Бібліотека прикладів
│   │   ├── UniCompEditor.tsx      146 рядків — Обгортка редактора
│   │   ├── GridResizePanel.tsx    137 рядків — Управління розміром сітки
│   │   ├── ImportExportPanel.tsx  134 рядків — JSON import/export
│   │   ├── ResultPreview.tsx       88 рядків — Превью одного символу
│   │   ├── BlockSelector.tsx       83 рядків — Навігація multi-line блоків
│   │   ├── Header.tsx              79 рядків — Шапка
│   │   ├── ControlsPanel.tsx       45 рядків — Налаштування (angleStep, etc.)
│   │   ├── LanguageSelector.tsx    41 рядків — Перемикання мови
│   │   ├── NavLink.tsx             28 рядків — Навігаційне посилання
│   │   └── ui/                    ~40 shadcn/ui компонентів
│   ├── hooks/
│   │   ├── use-toast.ts           186 рядків — Toast система
│   │   ├── useHistory.ts           78 рядків — Undo/redo (max 20)
│   │   ├── useLocale.ts            54 рядків — i18n хук
│   │   ├── useKeyframeAnimation.ts 54 рядків — Відтворення анімації
│   │   └── use-mobile.tsx          19 рядків — Media query
│   └── pages/
│       ├── Index.tsx              558 рядків — Головна сторінка (state management)
│       └── NotFound.tsx            24 рядків — 404
├── vite.config.ts               — Vite: port 5000, host 0.0.0.0, .replit.dev allowed
└── package.json                 — npm, React 18, TypeScript, Tailwind
```

---

## 7. Ключові експорти парсера v5.0 (unicomp-parser.ts)

### Нові типи v5.0
```typescript
// Security limits (DoS-захист)
export const SECURITY_LIMITS = {
  MAX_INPUT_LENGTH: 10000, MAX_SYMBOLS: 1000, MAX_PARAMS_PER_SYMBOL: 20,
  MIN_GRID_SIZE: 2, MAX_GRID_SIZE: 100, TIMEOUT_MS: 100, MAX_LINES: 500
}

// Нові бейкнуті вектори:
export interface LCVector {
  c?: string;    // колір символу (compound HSLA)
  b?: string;    // обведення символу (compound: "width, H, S%, L%, alpha")
  bc?: string;   // фон шару (compound: "H, S%, L%, alpha, radius")
  bb?: string;   // рамка шару (compound: "width, H, S%, L%, alpha")
}

export interface TRVector {
  f?: 'h' | 'v' | 'hv';
  r?: number;
  m?: string;
  st?: { angle: number; force: number };
  sp?: { angle: number; force: number };
  w?: { angle: number; force: number };   // тепер офіційно в векторі!
}

export interface GSVector {
  gc?: string;   // фон сітки
  gb?: string;   // рамка сітки
}
```

### Розширені SymbolSpec і UniCompSpec
```typescript
// SymbolSpec тепер має:
lc?: LCVector;   // всі кольорові параметри разом
tr?: TRVector;   // всі трансформації разом

// UniCompSpec тепер має:
gs?: GSVector;   // стилі сітки
```

### Публічний API (треба оновыти, бо у тексті на початка данного документа відбулись оновлення параметрів)
```typescript
// Основні функції:
export function parseUniComp(input: string): ParseResult
export function parseMultiLine(input: string): MultiLineParseResult
export function bake(spec: UniCompSpec): UniCompSpec     // НОВА: повна bake в lc/tr/gs/d
export function stringifySpec(spec: UniCompSpec, baked?: boolean): string

// Реєстр:
export function getRegistry(): UniCompRegistry
export function resetRegistry(): UniCompRegistry

// Геометрія:
export function getRect(start, end, gridWidth): { x1, y1, x2, y2, width, height }
export function linearToCoords(index, gridWidth): { x, y }
export function symbolToCoords(sym, gridWidth): { x, y, w, h }
export function coordsToSymbolIndices(coords, gridWidth): { start, end }

// Трансформації:
export function resolveHistory(steps: HistoryStep[]): { st, sp, rotate, scale, opacity, ... }
export function appendTransformToHistory(spec, indices, param, value): UniCompSpec
export function undoLastHistoryParam(spec, indices): UniCompSpec
export function resizeGrid(rule, newWidth, newHeight): string
```

> **Внутрішні класи (НЕ exported):** `class Tokenizer`, `class Parser`, `class SecurityError`

---

## 9. ColorStrokePanel.tsx

UI компонент кольору та обведення (448 рядків). Інтегрований в UniCompRenderer.

```typescript
interface ColorStrokePanelProps {
  color?: string; opacity?: number;                                    // c=
  strokeWidth?: number; strokeColor?: string; strokeOpacity?: number;  // b=
  background?: string; backgroundOpacity?: number; borderRadius?: string; // bc=
  layerBorderWidth?: number; layerBorderColor?: string; layerBorderOpacity?: number; // bb=
  onSymbolChange(data, isFinal): void;
  onLayerChange(data, isFinal): void;
}
```

**Візуально:** HSL-кільце (72 сегменти), Saturation/Lightness/Opacity слайдери, вкладки Symbol/Layer.

---

## 10. Що РЕАЛІЗОВАНО в редакторі (UniCompRenderer.tsx)

**Візуальні:**
- Сітка з числовими індексами комірок
- Малювання символів з кольором, поворотом, flip
- Трапеція (st) і паралелограм (sp) через GPU shader
- Обведення символу (b=) через `transformer.render(mode=3)` (deprecated API)
- Фон шару (bc=) з підтримкою borderRadius
- Рамка шару (bb=) малюється після символів
- Nested refs (рекурсивний рендер через registry)
- Z-index сортування шарів при рендері
- ColorStrokePanel інтегрована (рядок 60 + рядок 1129)

**Інтерактивні жести (5 ручок на selection):**
- Центр → Move (переміщення в сітці)
- Top-Right → Rotate (поворот, snap по angleStep)
- Bottom-Right → Scale (масштабування з розширенням сітки)
- Top-Left → Skew (паралелограм sp, long-press)
- Bottom-Left → Taper (трапеція st, immediate)

---

## 11. Що НЕ РЕАЛІЗОВАНО / Roadmap

### Технічний борг
- [ ] `render-utils.ts` і `UniCompRenderer.tsx` — виклики `gpu.render()` (deprecated!) потребують міграції на `renderShapeFixed()` / `renderFullScene()`
- [ ] `LayerSymbol`/`GridParams` в UniCompRenderer — використовують OLD структуру (без `shape: ShapeParams`)
- [ ] `render(mode=3)` для stroke — deprecated, поверне 1×1 canvas

### Етап 1 — Фундамент (Style + Layer model)
- [ ] Підключити новий API SuperTransformer у render-utils та UniCompRenderer
- [ ] `gc` / `gb` — фон та рамка полотна (не захардкожені)
- [ ] `m` (Margin) — рендер стискання символу в комірці
- [ ] `w` (Warp) — підключити mode=4 в рендері символів
- [ ] `l` — layer index всередині z-площини
- [ ] `$` — зовнішні ресурси (SVG/PNG по URL)

### Етап 2 — 2.5D і перспектива
- [ ] Perspective Scene — глобальна перспективна проекція
- [ ] Z-Scale — символи з більшим z крупніші (ближче = більше)
- [ ] Parallax Camera — мишка/скрол зміщує Z-шари з різними коефіцієнтами
- [ ] Cubic Builder — 6 граней куба з 6 UniComp площин

### Етап 3 — Анімація і вбудовування
- [ ] Play State Engine — повний рушій 01/10/010/101
- [ ] `<unicomp>` Web Component
- [ ] CSS Export — конвертація в CSS keyframes
- [ ] AI Description Export — JSON з семантичними метаданими глибини/форми

---

## 12. Трансформаційний пайплайн (строгий порядок)

```
Margin (m)         → стискання/розтягування вмісту в комірці [НЕ РЕНДЕРИТЬСЯ]
  ↓
Flip (f)           → відображення по осі (canvas.scale)
  ↓
Skew/Parallel (sp) → паралелограм (GPU shader mode=1)
  ↓
Warp (w)           → нелінійне спотворення [ШЕЙДЕР ГОТОВИЙ, НЕ ПІДКЛЮЧЕНИЙ]
  ↓
Rotate (r)         → поворот (canvas.rotate)
  ↓
Perspective (st)   → трапеція/перспектива (GPU shader mode=0)
```

**Координатні системи:**
- Canvas: Y вниз, кут 0° = право, 90° = вниз
- Shader: Y вгору (`p.y = -p.y`), кут 0° = право, 90° = вгору
- Конвертація жест→шейдер: `shaderAngle = -screenAngle`

---

## 13. Алгоритм координат

**Лінійна адресація комірок:**
```
index = y * gridWidth + x
x = index % gridWidth
y = floor(index / gridWidth)
```

**Діапазон `start-end` (діагональ прямокутника):**
```
start = top-left cell index
end   = bottom-right cell index
```

**bakeD через geometry actors:**
```javascript
bakeD([x1,y1,x2,y2], { o:[dx,dy], s:[sw,sh], me:[el,et], se:[hl,ht] })
→ [[x1+dx-el, y1+dy-et], [x2+dx+sw+sh, y2+dy+sh+ht]]
```

---

## 14. Трансформації жестами (transform-tools.ts)

```typescript
computeTaper(input: TaperGestureInput): TaperResult      // st (трапеція)
computeShear(input: ShearGestureInput): ShearResult       // sp (паралелограм)
normalizeDegrees(angle): number
clampForce(value): number
```

---

## 15. Анімаційний рушій (animation-engine.ts)

```typescript
groupKeyframes(steps: KeyframeStep[]): KeyframeGroup[]
resolveKeyframeGroups(groups): ResolvedKeyframe[]
interpolateKeyframe(prev, next, t: 0..1): ResolvedKeyframe
```

**Delta операції анімації:**
```
op='='  → value = step.value   (абсолют)
op='>=' → value >= step.value  (дельта +)
op='<=' → value <= step.value  (дельта -)
```


**Delta операції (resolveHistory):**
```
op='='  → value = step.value   (абсолют)
op='+=' → value += step.value  (дельта +)
op='-=' → value -= step.value  (дельта -)
```

---

## 16. Дефолтний приклад (index.tsx)

```javascript
const DEFAULT_CODE = '(30×15):H5-98;"2"67-99;C8-101;—11-104;...'
// Сітка 30×15, кілька символів з різними позиціями та поворотами
```

---

## 17. Відомі проблеми (Known Issues)

1. **render-utils.ts** — `gpu.render()` (deprecated) × 3 виклики — повертають 1×1 canvas
2. **UniCompRenderer.tsx** — `transformer.render(mode=3)` для stroke (deprecated)
3. **LayerSymbol/GridParams** у рендері — старі інтерфейси, не відповідають новому SuperTransformer
4. **gc/gb** — фон і рамка полотна захардкожені, не парсяться
5. **m (margin)** — парситься, НЕ застосовується при рендері
6. **w (warp)** — шейдер готовий, але не підключений у рендері символів
7. **Play State** — рушій заглушений, тільки статичні кадри
8. **$ (external resource)** — не реалізовано

---

## 18. Конфігурація (Dev Environment)

- **Порт**: 5000 (Replit webview)
- **Host**: 0.0.0.0 + `allowedHosts: [".replit.dev", "localhost"]`
- **HMR**: `clientPort: 443` (Replit proxy)
- **Build**: `npm run build` → `dist/`
- **Deploy**: Static site

---

## 19. Інструкції для AI-агента

1. **Читай цей файл першим** — він пріоритетний контекст
2. **Парсер священний** — unicomp-parser.ts 2598 рядків v5.0. Тільки розширюй, не переписуй
3. **GPU API** — `renderFullScene()` — основний. `render()` — ЗАСТАРІЛИЙ. Новий код через `renderShapeFixed()`/`renderFullScene()`
4. **Новий SuperTransformer**: `LayerSymbol` і `GridParams` тепер приймають `shape: ShapeParams` (не img/fillColor)
5. **Конвертер кольору**: `static hslaToRgba()` (не `hslToRgba` — стара назва!)
6. **Нові параметри** — додавати в: SymbolSpec тип, switch в парсері, stringifySpec, рендер
7. **Z-сортування** — менший z малюється першим (painter's algorithm)
8. **bake()** в парсері — повна bake history+actors → вектори lc/tr/gs/d
9. **renderUniComp()** в UniCompCore — використовує `parseUniComp()` + `renderFullScene()`
10. **Тест-файл**: `parser.test.ts` (238 рядків) — перевіряй синтаксис парсера через тести

