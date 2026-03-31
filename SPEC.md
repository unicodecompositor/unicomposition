# UniComp Specification (v1.0)

## 1. Parameter Registry

| Код | Имя | Тип | Исходно | Описание |
| :-- | :-- | :-- | :------ | :------- |
| `g` | Grid Space | `ivec2` | required[`width`, `hight`] | Размер поля |
| `pg` | Primary Grid | `ivec2` | required[`start`, `end`] | primary grid with a relative offset to itself for histoty |
| `d` | Bounds | `ivec2` | required[`start`, `end`] | Финальный адрес ячеек [`start`, `end`] |
| `po` | Primary Offset | `ivec2` | [`start`, `end`] | primary offset laers after move or scale for hostory |
| `v` | Payload | `string` | required[`symbols`|`#id`|`@name`|`$src`] | Контент: символ, текст, путь к SVG или ссылка. |
| `id` | Identifier | `string` | `none` | Уникальный ID объекта для ссылок (`#id`). присваивается всему grid |
| `f` | Flip | `int` | `0` | Отражение: bitmask (0: none, 1: `h`, 2: `v`, 3: `hv`). |
| `m` | Margin | `vec4` | [`0px`, `0px`, `0px`, `0px`] Внутренние отступы [top, left, bottom, right]. |
| `sp` | Parallelogram | `vec2` | [`0°`, `1`] | Перспектива (трапеция). 1. `r:∡[0<-|1|->2]` или так r: `0<-(1)->2` Поворот  двухнаправленным переключателем ползуноком, вращение инструмента вокруг относитпльно статического холста. 2. Ползунок переключатель направления и силы `0<-1->2` X[`1->0`] tpggle and force Y[`1->2`] |
| `w` | Warp | `vec2` | [`0°`, `1`] | Нелинейное искривление. 1. `r:∡[0<-|1|->2]` или так r: `0<-(1)->2` Поворот  двухнаправленным переключателем ползуноком, вращение инструмента вокруг относитпльно статического холста. 2. Ползунок переключатель направления и силы `0<-1->2` Hourglass[`1->0`] tpggle and force Sphere[`1->2`] |
| `r` | Rotation | `float` | [`0°`] | Угол поворота в градусах. |
| `st` | Trapezoid | `vec2` | [`0°`, `1`] | Искажение (параллелограмм). 1. `r:∡[0<-|1|->2]` или так r: `0<-(1)->2` Поворот двухнаправленным переключателем ползуноком, вращение инструмента вокруг относитпльно статического холста. 2. Ползунок переключатель направления и силы `0<-1->2` flipPerpendicularToTheSlider[`1->0`] tpggle and force flipPerpendicularToTheSlider[`1->2`] |
| `tr` | Figure Transformations | `struct` | [`f`, `m`, `sp`, `w`, `r`, `st`] | Перечень трансформаций фигуры/символа/изображения |
| `c` | Figure/Symbol Color | `struct` | [`0`, `0%`, `0%`, `0`, `0°`] | vec4[`hsla`]+vec2[`r`] Цвет и детализация скругление символа исходя из radius заданном в width параметра `b` |
| `b` | Figure/Symbol Border | `struct` | [`0`, `0%`, `0%`, `0`, `0px`] | vec4[`hsla`]+float[`w`] Цвет и толщина обводки символа. |
| `bc` | Layer Color | `struct` | [`0`, `0%`, `0%`, `0`, `0°`] | vec4[`hsla`]+vec2[`r`] Цвет заливки фона Layer Box |
| `bb` | Layer Border | `struct` | [`0`, `0%`, `0%`, `0`, `0px`] | vec4[`hsla`]+float[`w`] Обводка контейнера слоя Layer Box |
| `lc` | Layer and Figure Colors | `UBO` | std140[ `c`, `b`, `bc`, `bb`] | Перечень раскраски слоя и его содержимого |
| `gc` | Grid Color | `struct` | [`0`, `0%`, `0%`, `0`, `0°`] | vec4[`hsla`]+vec2[`r`] Фоновый цвет основной сетки. |
| `gb` | Grid Border | `struct` | [`0`, `0%`, `0%`, `0`, `0px`] | vec4[`hsla`]+float[`w`] Параметры внешних границ сетки. |
| `gs` | Grid Colors | `ubo`| std140[`gc`, `gb`] | Перечень раскраски пространства сетки |
| `k` | Keyframe | `int` | `0` | Порядковый номер кадра анимации. |
| `p` | Play State | `int` | `0` | Режим плеера bitmask(0: `0`, 1: `1`, 2: `01`, 3: `01`, 4: `101`, 5: `010`, 6: `100`, 7: `001`, 8: `000`). |
| `t` | Time | `float` | `1.0` | Длительность интерполяции кадра. |
| `l` | Layer | `int` | `required[serial numbe]` | Определяется порядком блока в строке, обязателен но генерируется автоматически. `l` и `z` переопределяют порядок друг друга автоматически, если пользователь меняет порядок одного или другого. |
| `z` | Plane/Layer Group | `int` | `0` | Индекс задается пользователем, присваивается слоям как неразрывной последовательности слоёв. при присвоении параметра z= автоматически пересчитывается l= и переносит блок в текстовом правиле на новую layer позицию. кроме того z это локальный псевдо #id в который рендерятся все l= но отображаются только когда создается `vp` указатель на глубину и смещение пространства |
| `vp` | Vanishing Point | `0`, `0`, `0` | [x,y,x] сдвиг от центра и глубина перспективы для разложения наших z playn последовательностей с учетом их количества индексов а так же коэфициента масштаба по пути как они разлодены. Это плоская перспектива. | 
| `zd` | Turn Side | `string` | `Y`, `0`, `Z`, `X`, `0`, `0` | [top(Y, 0), bottom(Z, X), flip(H, V)] - матрица осей и отражений |
| `zi` | Identifier Side Cube | `string` | `0` | индекс стороны по сути противоположный аналог #id но создает указатель на сторону 3D пространства куда это #id сторон  транслируется как поток прорендеренных плоских кадров, для виртуального псевдо 3D пространства. ну или аналог v, только для grid и конкретной стороны и конкретной строчки текстового правила. То есть у нас многострочное правило состоит из 6 строк, это плоскости на каждую из которых транслируются пререндеры композиций #id своей стороны скомпанованный и прорендеренный #id объект. И он не присваивает id, а по сути вызывает на себя указанную сторону zi[0: front, 1: right, 2: left, 3: top, 4: bottom, 5: back, 6: viewer] - порядок записи строк, не критичен так как у нас есть параметр zd определяющий поворот стороны по осям который дублирует информацию про пространство при просмотре в окне viewer. То есть именно созданием фактических #id сторон, могут заниматься 6 человек или серверов, кластерных рендер ферм, и при этом транслировать все изменения пререндеренные каждый на свою сторону. По сути аналог hdr видео, то есть ИИ разбирая эти потоки может четко понять сторону, положение камеры, что по слоям и вложенным группам лежит и как расположенно друг относительно друга в анимации и режиме реального времени. |

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

### 2.9 Content Prefixes
| Символ | Призначення | Статус |
|:-------|:------------|:-------|
| `"string"` | Прямий текст/гліф у лапках | Реалізовано |
| `#id` | Посилання на об'єкт за ID | Реалізовано (refId) |
| `$src` | Зовнішній ресурс (SVG, PNG, IMG) | Не реалізовано


---

Рассчет трансформаций и состояний нового положения и при использовании инструментов `move layer box` и `scale layer box`. Tо есть нам нужно из логических операций получить 2 записи параметров:
- параметр `pg` пассивно накапливает свои изменения состояния и положения, вместе с остальными слоями, вгутрь записи `(W×H)[pg=start end]:[v=layer;d=start end][po=start end];`
- параметр `po` активно накапливает свои изменения в записи с добавлением к слою [блок|фрейм] последовательностей изменения состояний, тип [][][][]: `(W×H)[pg=start end]:[v=layer;d=start end][po=start,end][po=start end][po=start end][po=start end];`
- присдвигах и масштабировании нам необходимо пересчитывать суммарно щаполненное пространство всех слоёв, это и станет нашим новым размкром Grid Space (W×H) где его параметр [pg=start end] это первичный невидимый grid который существовал до появления нового пространства, но существовал все это время так же как все остальные слои и двигался вместе с ними, как слой который всегда hidden, но не потому что присвоен или созда, по посвоей природа, быть абстракцией исторического состояния первичного состояния пространства но с проекцией на подобие слоям, и никогда не отображается и никогда не может редактироваться, он просто сам по себе движется пересчитывается в текстовом правиле, так же как и все не выделенные слои в момент редактирования активно выделенных и редактируемых слоёв, но этот нулевой первичный Grid, так же пассивно сдвигается относительно нового пространства Grid Space, что и позволяет всегда сипользовать его как точку привязки дляслоёв котооые сейчас редактируются и котооым добавляются относительные записи [po=start end], в смысле относительно этого самого pg несуществующего но [вычислимого слоя|нулевого grid].

---

diff_расширения - когда передвигаемые слой, область выделения группы слоёв, её начало или конец, верх, низ, лево или право, меньше 0 лева и верха или больше размера сетки права и низа grid поля, добавление сдвига и пересчет пространства происходит каждые 200-300 сдвиг на + 1 клетку расширения пространства Grid Space:

d(start, end) = pg(start, end) + po(start, end)

po(start, end) = d(start, end) - pg(start, end)

pg(start, end) = pg₀(start, end) + diff_расширения(start, end)

---

Последовательность
Все слои смещаютсч относительно первичного grid0
Слои смещаются с дельтой и могкт иметь отрицательные относительные значения и записываются в каждый слой как очередность истории порядка изменений [][][][], и записывают свои относительные дельты в po в эти самые блоки []
Послесдвига должно автоматически рассчитаться общее пространство занимаемое всеми слоями включая невидимы первичный grid слой, получив новый размер пространства, автоматически обновляется grid (W×H) размерность и пересчитывася положение первичного grid в новом пространстве и записывается или обновляется в его параметр текстового правила pg=. Запись становится вот такой (W×H)[pg=new(start) new(end)]:, (W×H) <- относительно новой размерности сетки пересчитывается pg= его слой первичного предка
Имея новое пространство, и относительные положения всех слоёв po , относительно pg, мы можем рассчитать фактический `d` каждого слоя `layer[d=start end]` или так для текстового правила "layer"start-end;, это взаимозаменяемые записи. наш пересборщик текстового правила должен обновить всю запись строки, пройдя цикл рассчета относительного сдвига и их проекцию на нашу сетку

---

«Забудь про стандартные ползунки. Реализуй Radial Vector Controller для инструментов трансформации sp, w, st:

    Input: CenterPoint (CP) и TouchPoint (TP).
    Vector Calculation:
        Angle = atan2(TP.y - CP.y, TP.x - CP.x) — это угол разворота самого инструмента трансформации.
        Force = distance(CP, TP) / MaxRadius — это амплитуда.
    Logic Gate (Toggle):
        Если Force < 1.0, активируй режим A (например, Hourglass), где Intensity = 1.0 - Force.
        Если Force > 1.0, активируй режим B (например, Sphere), где Intensity = Force - 1.0.
    Output: Передай Angle и Intensity в шейдер как uniform vec2.»

---

## 3. Rendering Architecture (11 Layers)

The UniComp renderer executes drawing in a deterministic order:

**Group 1: Grid Renderer**
1. **Grid Background**: Fills the field with `gc`.
2. **Grid Border**: Draws the external `gb` frame.
3. **Grid Subdivision Lines**: Internal cell dividers (grid_size - 1).
4. **Cell Index Labels**: (Editor only) Sequential numbers for each cell.

**Group 2: Layer Renderer**
5. **Layer Background**: Fills the area defined by `d` with `bc`.
6. **Layer Border**: Container stroke `bb` applied on top.

**Group 3: Symbol Renderer**
7. **Symbol Face**: Draws the primary content `v` with style `c`.
7.1. **Shadow / Glow Mask**: "rgba, width, rotate" – placed under the symbol face.
8. **Symbol Border**: Outline `b` rendered over the face.
9. **Special Effects**: Programmable WebGL layer filters.
10. **Alpha Correction Mask**: Inverted alpha mask applied after SDF edge fix.

---

The system is designed to support:

- deterministic layout
- layered rendering
- procedural transformations
- animation through keyframes
- static export via baking

UniComp separates three independent domains:

| Domain | Purpose |
|------|------|
| Geometry | Defines where an element exists in grid space |
| Transform | Defines how the content is visually distorted |
| Material | Defines visual styling |

During export a **baking process** collapses procedural parameters into static values.

---

# 2. Rendering Architecture

Runtime Pipeline

1. Grid background
2. Grid border
3. Layer background
4. Layer border
5. Symbol face
6. Shadow / glow mask
7. Symbol border
8. Special effects
9. Alpha correction mask

------

Editor Pipeline

1. Grid background
2. Grid border
3. Grid subdivision lines
4. Cell index labels
5. Layer background
6. Layer border
7. Symbol face
8. Shadow / glow mask
9. Symbol border
10. Special effects
11. Alpha correction mask

---

# All Rendering Pipeline

Каждый grid, layer, [symbol|figure] со всеми своими разделёнными WebGL уровнями подслоев, рендерится по отдельности, но у каждого из них берется первичный его габаритный размер, умножается на 3, это будет размер нашего нового WebGL холста, то есть буфера X×Y, на котором мы распологаем эти загруженные слои символы и фигуры, центром [фигуры|символа] относительно центра WebGL буфера. Затем после рендера трансформаций, зарисовок и заливки цвета, этот слой возвращается на общий холст, с позиционированием по центру относительно центра блока Layer из которого был загружен данный слой [Figure|Symbol]. То есть при первом рендере каждому слою создается дополнительный буфер вокруг собственного изображения. А при обратном встраивании необходимо учитывать обратное масштабирование на 1/3 что бы легко синхронизировать позиционирование центров. Это позволяет свободно рендерить любые трансформации не ограничиваясь размерностью Layer или самого изображения. Главная тонкость, чётко отслеживать однократное умножение на 3 буфера, что бы это ни в коем случае не происходило при любых трансформациях или заливках цвет, так как тогда буфер станет раздуваться в бесконечность, а этого нельзя допустить. Нужено именно одноразовое увеличение размерности буфера. Так же не допустимо обрезание фигуры при трансформациях, буфер должен увеличиваться. Если в 3 раза не хватает, тогда увеличить в 5 раз, а делитель для обратного встраивания на холст, станет 1/5. То есть необходимы проверки на прозрачность краёв, что бы их размеры при приближении к краю автоматисески создавали увеличенный буфер, относительно первичных значений размерности первичного изображения и подставлять это же значееие для обратно пропорционального масштабирование для обратного встраивания и позиционирования на холсте. Вообще все трансформации с фигурами производятся относительно их изначального изображения, те есть не должно происходить странностей с бесконечно увеличивающимся буфером или же слетанием масштабирования самого изображения или же внезапного обрезания краёв изобоажения или уползания за окно от центра, ну или полное прекращение рендеринга, как и не должно происходить пересечания сетки поля, слоёв, фигур, утечки их параметров друг к другу, а так же не должно быть отсутствующих дефолтныех значений.

The UniComp editor renders the composition using a deterministic multi-layer pipeline.

# Rendering Architecture

The UniComp rendering system is organized into three independent rendering stages.

Each stage is responsible for a specific structural level of the composition.

Rendering always proceeds in the following order:

1. Grid Renderer
2. Layer Renderer
3. Symbol Renderer

This separation ensures deterministic rendering and simplifies implementation across different graphics backends.

The complete pipeline contains **11 ordered rendering stages**.

---

# Grid Renderer

The Grid Renderer draws the base workspace of the composition.

Runtime responsibilities:

1. Grid background
2. Grid border

Editor-only overlays:

3. Grid subdivision lines
4. Cell index labels

The subdivision lines divide the grid into visible cells.  
The number of internal lines equals:

grid_size − 1

Cell indices are used only for editor visualization.

---

# Layer Renderer

The Layer Renderer draws the container region of each layer.

Rendering order:

1. Layer background
2. Layer border

The layer background fills the rectangular region defined by the geometry vector `d`.

The layer border is rendered above the background and defines the visible boundary of the layer.

---

# Symbol Renderer

The Symbol Renderer draws the actual content placed inside a layer.

Rendering order:

1. Symbol face
2. Shadow / glow mask
3. Symbol border
4. Special effects
5. Alpha correction mask

The Symbol face represents the primary content of the layer and may originate from:

- glyphs
- text
- SVG paths
- images
- referenced symbols

Optional masks may be generated from the symbol geometry to produce shadows or glow effects.

After symbol rendering, post-processing effects may be applied.

Finally, an inverted alpha mask may be applied after Signed Distance Field (SDF) edge correction to remove edge artifacts.

### 7.1 Shadow / Glow Mask
Optional mask derived from the symbol shape.

Parameters:
rgba
width
rotation

This mask is generated from the symbol geometry and used to produce:

- shadows
- glows
- directional light effects

It is applied beneath the symbol face.

### 8. Symbol Border
Outline rendered on top of the symbol face.

This border follows the symbol geometry.

### 9. Special Effects
Optional post-symbol visual effects.

Examples:

- glow
- blur
- color shift
- distortion

### 10. Alpha Correction Mask (SDF Edge Fix)

Signed Distance Field (SDF) rendering may introduce edge artifacts.

An inverted alpha mask is applied after edge correction to ensure clean boundaries.

---

# Total Rendering Layers

The complete rendering pipeline consists of:

| Stage | Layer |
|------|------|
| 1 | Grid Background |
| 2 | Grid Border |
| 3 | Grid Subdivision Lines |
| 4 | Cell Index Labels |
| 5 | Layer Background |
| 6 | Layer Border |
| 7 | Symbol Face |
| 7.1 | Shadow / Glow Mask |
| 8 | Symbol Border |
| 9 | Special Effects |
| 10 | Alpha Correction Mask |

Total: **11 rendering layers**

---

# 3. Composition Hierarchy

Hierarchy structure:

Grid  
└── Plane (z)  
  └── Layer (l)  
    └── Content (v)

Example of the nesting order of entities:

g[
z[
l[

v[h,k][h,k][h,k]

];

l[

v[h,k][h,k][h,k]

]
];

z[
l[

v[h,k][h,k][h,k]

];

l[

v[h,k][h,k][h,k]

]
]
]

---

# 4. Parameter Groups

Parameters are grouped into vectors.

---

# 4.1 Identity and Content

| Parameter | Description |
|------|------|
| id | unique identifier |
| v | content payload |

Content types may include:

- symbol
- text
- id reference
- SVG path
- image reference

Examples:

v="@icon"  
v="#logo"  
v="$../assets/logo.svg"

---

# 4.2 Geometry Vector

Geometry is stored in vector **d**.

d = "start[x1,y1], end[x2,y2]"

Where:

| Parameter | Meaning |
|------|------|
| x1 | start column |
| y1 | start row |
| x2 | end column |
| y2 | end row |

This defines the rectangular region occupied by a layer.

---

# 4.3 Style Vector

Material styling is stored in **lc**.

lc = (c, b, bc, bb)

| Parameter | Description |
|------|------|
| c | symbol color |
| b | symbol border |
| bc | layer background |
| bb | layer border |

---

# 4.4 Grid Style Vector

Grid styling is stored in **gs**.

gs = (gc, gb)

| Parameter | Description |
|------|------|
| gc | grid background |
| gb | grid border |

---

# 4.5 Transform Vector

Transforms are stored in the **tr** vector.

tr = (f, m, sp, w, r, st)

Transforms are applied in a deterministic order defined by the rendering pipeline.

These transforms affect the **visual representation of the symbol** but **do not modify grid geometry (`d`)**.

---

## Transform Execution Order

| Render Index | Parameter | Description |
|---|---|---|
| 0 | f | Flip (axis reflection) |
| 1 | m | Margin (content fitting inside layer bounds) |
| 2 | sp | Parallelogram skew |
| 3 | w | Warp distortion |
| 4 | r | Rotation |
| 5 | st | Trapezoid transform (pseudo-perspective) |

---

## Transform Stack

Transforms are evaluated sequentially:
presentation but do not modify grid geometry.

---

# 7. Material Actors

Material vector:

lc = (c, b, bc, bb)

Channels include:

- symbol color
- symbol border
- layer background
- layer border

Grid styling uses:

gs = (gc, gb)

---

# 8. Transform Actors

Default transform order:

f → m → sp → w → r → st

| Transform | Description |
|------|------|
| Flip | axis reflection |
| Margin | content fitting |
| Parallelogram | skew transformation |
| Warp | nonlinear distortion |
| Rotation | rotation |
| Trapezoid | pseudo-perspective |

---

# 9. Relation to History

History states:

[h0]
[h1]
[h2]
…  
[hn]

During baking:

[h0..hn] → lc

Only the final material state remains.
## Layer State

It does not modify:

- geometry (`d`)
- material (`lc`)
- transforms (`tr`)

---

# 14. Image References

External resources may be referenced with `$`.

Examples:

v="$/src/icon.svg"  
v="$../assets/image.png"  
v="$https://cdn.site/image.jpg"

---

# 15. Layer States (Not used in a text rule. These are logical operators)

Layer state parameter:

- selected
- invisible
- locked
- none

---

# 16. Rendering Order

Rendering pipeline:

Grid Background
Grid Border  
Layer Background  
Layer Border  
Symbol Color
Symbol Border  
Effects 
Mask