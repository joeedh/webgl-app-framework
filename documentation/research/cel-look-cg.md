# Cel-Look CG (セルルック3DCG / 卡通渲染 / 셀룩): A Survey of Practice in East Asian Animation

*Compiled 2026-07-09. Written in English; source base is predominantly
Japanese-language (industry press, developer talks, and one government
institutional source), with secondary Chinese material. Every specific claim is
footnoted to a source. Confidence levels and the significant Korean/Chinese
evidence gap are stated explicitly in [§8 Caveats](#8-caveats-and-confidence).*

---

## 1. What "cel-look" means

**"Cel-look" (セルルック, *seru-rukku*)** is the deliberate practice of making
inherently three-dimensional CG *appear flat and two-dimensional* so that it
reads like hand-drawn 2D cel animation (作画アニメ / セルアニメ). Japanese industry
sources converge on near-identical definitions: it is "deliberately making 3D CG
look flat/planar" (本来は立体的な3DCGをあえて平面的に見せる) — a "technique for making CG look
like hand-drawn drawn animation" (CGを手描きの作画アニメのように見せる技術) — i.e., "3D
animation brought toward the drawing (作画) of 2D/cel animation."[^def1][^def2][^def3]
The core rendering technique is **cel shading / toon rendering**
(セルシェーディング / トゥーンレンダリング), used specifically to *suppress the sense of
three-dimensionality* (立体感を抑え) in how shadow and color are applied.[^def4][^def5]

A useful boundary condition emerged from verification: the goal is *resemblance*
to 2D, not *deception*. The stronger framing — that cel-look works are crafted so
precisely they are "mistaken for" 2D hand-drawn animation — did **not** survive
adversarial checking and is an overstatement of what practitioners claim.[^refute1]
The realistic aim is that CG blend naturally alongside 2D and read as belonging
to the same drawn idiom.

The English term "cel-look" corresponds to Chinese **卡通渲染** (*kǎtōng
xuǎnrǎn*, "cartoon/toon rendering") and Korean **셀룩 / 카툰 렌더링** (*sel-luk* /
"cartoon rendering"); this survey found robust primary documentation for the
Japanese practice and only secondary/community documentation for the Chinese and
Korean scenes (see [§7](#7-korean-and-chinese-practice)).

---

## 2. The core problem: three elements, and why shading is the hard one

The most rigorous framing in the surveyed material comes from **Arc System
Works**' technical artist Junya "C." Motomura, via the CGWORLD report on his
CEDEC 2016 session (on *Guilty Gear Xrd -REVELATOR-*) and his GDC 2015 talk. He
decomposes the look of an anime image into **three controllable elements**:[^three1][^three2]

1. **Line art (線画)** — the outlines/contours.
2. **Color specification (色指定)** — the flat fill colors.
3. **Shadow / shading specification (陰影指定)** — where shadow falls and how hard
   its boundary is.

The central insight is that **shading is the hardest element**, because in
hand-drawn anime "shadows are *designed by the animator*"
(アニメの陰影はアニメーターによってデザインされている) for aesthetic effect — they are *not* a
physical computation of light on a surface.[^three1] A physically-correct
renderer therefore produces the *wrong* shadows for cel-look; the shadows must be
placed by hand, on purpose, where a 2D artist would have drawn them.

The two named techniques Arc System Works uses to regain that control are:[^three1]

- **Vertex color (頂点カラー)** — painting shading directly onto mesh vertices to
  place a shadow at the desired position and intensity, independent of the light.
- **Vertex-normal editing (法線編集 / 法線調整)** — hand-adjusting per-vertex
  normals so the toon-shaded terminator (the lit/shadow boundary) and the outline
  fall cleanly, at the intended location and "timing," rather than following the
  raw geometry. This is what keeps a rounded 3D face from showing an ugly,
  physically-correct shadow gradient where a 2D artist would have drawn a single
  clean crescent.

**Guilty Gear Xrd is the canonical technical exemplar** of the whole field. Its
stated mission, in Motomura's own words at GDC 2015, was to "rebuild a classic 2D
fighting game within a modern full-3D graphical framework, while maintaining all
of its old-school 2D charms."[^ggx1] The result is convincingly 2D — the 3D
nature is only revealed when the camera rotates.[^ggx2] (Community sources
attribute the pipeline to Unreal Engine; the model-warping and per-frame normal
work below sit on top of that engine.[^ggx2])

---

## 3. Technical methods for the 2D look

Drawing together the surveyed sources, the cel-look toolbox is:

| Method | What it does | Evidence |
|---|---|---|
| **Cel / toon shading** | Posterizes lighting into 1–2 flat bands to suppress volume (立体感を抑え) | [^def4][^def5] |
| **Vertex color** | Hand-places shadow at a chosen position/intensity, decoupled from the light | [^three1] |
| **Vertex-normal editing / transfer** | Reshapes the shading terminator and outline so they fall where a 2D artist would draw them | [^three1] |
| **Outline / line-art rendering with weight variation** | Renders contours as lines; the hard part is giving them hand-drawn **thick/thin (強弱)** modulation, difficult in off-the-shelf software | [^ppixel1] |
| **Model warping per camera angle** | Distorts the model as the camera moves so the silhouette keeps reading as an intentional 2D drawing (see Camera-O-Matic, [§5](#5-studios-tools-and-productions)) | [^camo1][^camo2] |
| **Limited-animation timing ("on 3s", 8 fps)** | Reduces unique frames to break the "too smooth" CG cadence and mimic drawn animation | [^sanzigen1] |
| **Muted / pale color palette** | The characteristically desaturated cel-look palette; in hybrid films the 2D side is pulled *toward* it for unity | [^promare1] |

### Limited-animation timing

A distinguishing move is deliberately *throwing away* frames. **Sanzigen**'s
signature style combines cel-look shading with **limited animation reduced to 8
frames per second** (一秒8コマ) — against the 24 fps full-animation norm — precisely
so the 3DCG reads as hand-drawn cel animation rather than as smooth CG.[^sanzigen1]
Eight unique frames per second is equivalent to shooting "on 3s," a documented
Sanzigen cadence (*Arpeggio of Blue Steel*, *BanG Dream!*).[^sanzigen1]

---

## 4. Hybrid pipelines: combining 2D drawing directly with 3D

A defining feature of the East Asian cel-look tradition — and the part of the
question most directly about "2D combined with 3D" — is that the 3D is routinely
**retouched, over-drawn, and re-timed by hand-drawing animators**. The CG is a
substrate, not the finished image.

### 4.1 Hand-drawn correction over CG (drawn-on-3D "sakuga" retouch)

The clearest documentation is the Agency for Cultural Affairs' **Media Arts
database** (bunka.go.jp), an institutional government source, describing Studio
Orange's process: experienced **hand-drawing animators retouch the CG character
faces**, adjusting "the line positions of the eyebrows, eyes and mouth"
(眉毛や目、口の線の位置) and distorting eyelash and mouth shapes using traditional 2D
know-how laid over the 3DCG.[^retouch1] Dialogue is pre-recorded so these hand
corrections can be matched to the vocal performance for nuanced
expression.[^retouch1] This is the "2D-on-3D" / hand-corrected-CG core of the
hybrid method.

### 4.2 Hand-keyed animation instead of motion capture

A recurring, verified principle: **cel-look production deliberately favors
hand-keyed (手付け) animation over motion capture**, because mocap makes movement
"too realistic/raw" (生々しくなりすぎ) and clashes with the cel-look. Polygon
Pictures' CG Supervisor Takashi Nagasaki (on *Ajin*) states that with mocap "the
movement becomes too raw and stops matching the cel-look," and stresses balancing
the *density of visual vs. motion information*.[^mocap1] On the short *Tenjin*
(天神), the director likewise built movement "largely by hand" (かなり手付けで動きを
作っています) because hand-keying "becomes more anime-like" (アニメっぽくなる).[^mocap2]

### 4.3 Mutual convergence of the 2D and 3D layers

In fully hybrid films the two layers are made to meet in the middle. On *Promare*
(Studio Trigger / production by studios with ~a decade of accumulated cel-look
know-how), the 3DCG chases a hand-drawn look **while the hand-drawn portions
adopt the muted/pale cel-look palette**, so each side moves toward the other:
"the hand-drawn animation is also brought toward the 3DCG side by giving it the
pale coloring characteristic of cel-look 3DCG."[^promare1]

---

## 5. Studios, tools, and productions

### Studio Orange (株式会社オレンジ)

Founded 2004 by Eiji Inomoto; its defining strength is the **"natural fusion"
(自然な融合) of 3DCG with hand-drawn cel animation**.[^orange1][^orange2] *Land of
the Lustrous* (宝石の国, 2017) was Orange's **first project as prime contractor**
(元請), used conventional cel-look CG for its characters, won a VFX-Japan Award
(2018), and was widely praised for its CG animation.[^orange2][^orange3]

- **Camera-O-Matic** — Orange's proprietary tool that **automatically morphs /
  warps the 3D model as the camera angle changes**, adding perspective and
  low-angle (アオリ) lens-warp so the CG doesn't "look strange from different
  angles."[^camo1] Independently corroborated by the *Trigun Stampede*
  Sakura-Con 2023 panel, which describes "a program for warping the model" to stop
  CG looking strange as the camera shifts; per Orange's R&D, 60–80% of this is
  automatic.[^camo2] Orange also used **multiple separate engines** for different
  stages of *Trigun Stampede* (one for testing expressions, another for
  shading), and spent ~two years developing the characters' expressions.[^camo2]

### Polygon Pictures (ポリゴン・ピクチュアズ)

Developed a **proprietary in-house NPR renderer, PPixel**, specialized in
cel-look CG "that renders 3DCG like hand-drawn cel animation." Its notable
capability is rendering character outlines as **hand-drawn-style lines with
thick/thin weight variation (強弱)** — something difficult in conventional
software. First fully deployed on *Estab Life: Great Escape* (2022).[^ppixel1]

### Sanzigen (サンジゲン)

Signature style = **cel-look shading + 8 fps limited animation** (see
[§3](#3-technical-methods-for-the-2d-look)); productions include *Arpeggio of
Blue Steel* and *BanG Dream!*.[^sanzigen1]

### Game-engine (Unity/Unreal) pipelines for film

Cel-look *films* increasingly run on **real-time game engines**:

- ***HELLO WORLD*** — a **custom shader** was developed and 3ds Max + After
  Effects + Unity integrated; staff had to overcome "conceptual differences
  (概念の違い) between game engines and animation production."[^engine1]
- ***Ashita Sekai ga Owaru to Shite mo* (あした世界が終わるとしても)** — a
  text-storyboard → text-movie → layout-movie → primary-movie pipeline fed
  **Unity**, cutting rendering time by avoiding frame-by-frame offline
  rendering.[^engine2]
- *Guilty Gear Xrd* (Unreal, real-time game) remains the reference point for the
  underlying shading approach.[^ggx1][^ggx2]

### Consumer / indie: Blender

Cel-look 3DCG is now an established indie workflow. The Japanese production
magazine **VIDEO SALON** (Genkosha) ran a January 2023 cover feature, "The World
of 3DCG Cel-Look Anime made in Blender" (Blenderで作る3DCGセルルックアニメの世界), with
making-of breakdowns and ~30 creator interviews.[^blender1]

### A rising industry trend

There is a documented trend of more cel-look anime being produced with 3DCG,
pulling even photorealistic-CG-specialist studios toward it: Imagica Digital Scape
noted that "titles making cel-look anime with 3DCG are on the rise, and even our
company, which is strong in photoreal 3DCG, wants to work on more cel-look
CG."[^trend1] (Read as a ~2022 self-description; the trend itself is corroborated
by growth at Orange, Sanzigen, and Polygon Pictures.)

---

## 6. A note on what did **not** hold up

Two plausible-sounding claims were **refuted** in verification and should not be
repeated as fact:

- That the goal is works "**mistaken for** 2D" — overstates it; the goal is
  *resemblance*, not deception.[^refute1]
- That a specific **Maya + Pencil+ 4** workflow is *the* standard teaching
  pipeline for cel-look character modeling — this single-tutorial framing did not
  generalize.[^refute2] (Pencil+ and Maya are certainly *used* in the field; the
  claim that they constitute the canonical pipeline is what failed.)

---

## 7. Korean and Chinese practice

**This is the weakest-sourced part of the survey, and honesty requires flagging
it prominently.** Despite explicitly targeting Korean (셀룩 / 카툰 렌더링) and Chinese
(卡通渲染) sources, **no Korean- or Chinese-language *industry* claim survived
adversarial verification.** The gap reflects the reach of this survey, not the
absence of these industries' practice.

What the (unverified) Chinese-language material did surface — reported here as
*leads, not established facts*:

- A Chinese technical breakdown of **Genshin Impact (原神)**'s cel-look pipeline
  traces its facial-shading approach to **editing/correcting character normal
  maps** (plus AO-texture adjustment) so the lit/shadow transition across the face
  stays smooth and clean as the light direction changes — explicitly described as
  descending from the **Japanese model-normal-editing method** (i.e. the same
  vertex-normal technique documented for Guilty Gear Xrd in
  [§2](#2-the-core-problem-three-elements-and-why-shading-is-the-hard-one)).[^genshin1]
- The same source describes Genshin layering **multiple shadow implementations by
  distance**: lightmap-based static shadows with LOD (high precision near, baked
  vertex colors far), light probes for dynamic character shadowing, and projected
  shadows onto terrain.[^genshin2]

This is consistent with a broader pattern worth stating as a hypothesis: the
Chinese real-time cel-look scene (Genshin Impact and its imitators) and the Korean
scene appear to have **inherited the Japanese vertex-normal / hand-placed-shadow
vocabulary** and re-applied it in game-engine contexts — but the surveyed evidence
is not strong enough to assert specifics. See open questions in
[§8](#8-caveats-and-confidence).

---

## 8. Caveats and confidence

**Confidence by claim** (high = multiple independent sources incl. a primary; the
rest as noted):

- **High:** the definition of cel-look; the three-element (線画/色指定/陰影指定)
  framing and shading-is-hardest thesis; vertex-color + normal-editing technique;
  Guilty Gear Xrd as exemplar; Studio Orange's identity, *Land of the Lustrous*,
  and Camera-O-Matic; hand-drawn facial retouch; hand-keying over mocap; Sanzigen
  8 fps; Polygon Pictures / PPixel; Unity/Unreal film pipelines.
- **Medium:** the "rising trend" framing (time-sensitive to ~2022); Blender as an
  established indie workflow.
- **Unverified / leads only:** all Chinese and Korean specifics in
  [§7](#7-korean-and-chinese-practice).

**Source quality is mixed.** The strongest anchors are a **primary developer
talk** (Guilty Gear Xrd, GDC 2015) and an **institutional government source**
(bunka.go.jp Media Arts database). Many descriptive and definitional claims rest
on **secondary industry press** (CGWORLD, animeanime.jp, Impress AV Watch) and
**studio blogs** — adequate for uncontroversial description, not independently
benchmarked. Vendor-capability phrasing (PPixel "difficult in conventional
software"; Unity "reduced rendering time") should be read as *reported* claims,
not measured. Most facts are historical (2015–2023) and stable.

**Open questions** (unresolved by this survey):

1. Specific cel-look/NPR practices, signature studios, and tools of the **Korean
   (셀룩)** and **Chinese (卡通渲染)** industries.
2. How posterized-shading, stepped/on-3s timing, and outline techniques differ
   concretely between **real-time game pipelines** (Guilty Gear/Unreal/Unity) and
   **offline film pipelines** (Orange / Polygon Pictures PPixel).
3. Post-2023 state of **normal-transfer and automated shadow-control tools**, and
   the relative adoption of Pencil+, in-house renderers (PPixel), and Blender's
   toon/line-art stack.
4. How much of a modern cel-look production remains **manual hand-drawn
   correction** vs. automated, and how that ratio trends as tools like
   Camera-O-Matic mature.

---

## Sources

[^def1]: anime.eiga.com — editor column defining セルルック as "deliberately making
    3D CG look flat/planar" (本来は立体的な3DCGをあえて平面的に見せる).
    https://anime.eiga.com/news/column/editor_bookshelf/119123/
[^def2]: Japanese Wikipedia, サンジゲン / セルルック entries — "セルルック（CGを手描きの作画
    アニメのように見せる技術)." https://ja.wikipedia.org/wiki/サンジゲン
[^def3]: Sublimation Inc. column — "3Dアニメを2Dアニメ（作画アニメ、セルアニメ）の作画に
    寄せたアニメーションのこと." https://www.sublimation.co.jp/column/works_20220311/
[^def4]: Sublimation Inc. column — cel shading used to "suppress the sense of
    three-dimensionality" (立体感を抑え). https://www.sublimation.co.jp/column/works_20220311/
[^def5]: confidence-creator.jp — "セルシェーディング / トゥーンレンダリング" as the core
    technique for 平面的な3Dアニメ. https://confidence-creator.jp/column/1215/
[^three1]: CGWORLD, CEDEC 2016 report (Arc System Works, Motomura) — 線画・色指定・
    陰影指定 three-element framing; アニメの陰影はアニメーターによってデザインされている;
    頂点カラー and 法線編集. https://cgworld.jp/article/201609-cedec-cell.html
[^three2]: GDC Vault — "Guilty Gear Xrd's Art Style: The X Factor Between 2D and
    3D" (Junya C. Motomura, GDC 2015).
    https://www.gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The
[^ggx1]: GDC Vault (as above) — stated mission to "rebuild a classic 2D fighting
    game within a modern full-3D graphical framework, while maintaining all of its
    old-school 2D charms." https://www.gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The
[^ggx2]: 3dnchu.com — Guilty Gear Xrd -SIGN- 3D models rendered to look 2D; 3D
    only revealed on camera rotation. https://3dnchu.com/archives/guilty_gear_xrd_sign/
[^ppixel1]: Impress AV Watch — Polygon Pictures' proprietary NPR renderer
    "PPixel"; character lines as 手描きのように強弱をつけた線; first full deployment on
    *Estab Life: Great Escape* (2022). https://av.watch.impress.co.jp/docs/news/1389028.html
[^sanzigen1]: Japanese Wikipedia, サンジゲン — limited animation reduced to 一秒8コマ
    (8 fps) combined with セルルック. https://ja.wikipedia.org/wiki/サンジゲン
[^promare1]: mori2-motoa hatenablog — *Promare*: 手書きのアニメーションの方もセルルック
    3DCG特有の淡い色合いにする事で3DCG側に表現を寄せています.
    https://mori2-motoa.hatenablog.com/entry/2019/07/14/011053
[^retouch1]: Agency for Cultural Affairs Media Arts database — hand-drawing
    animators correct 眉毛や目、口の線の位置 over the 3DCG; dialogue pre-recorded.
    https://mediag.bunka.go.jp/article/13643-2/
[^mocap1]: animeanime.jp (2017, *Ajin* / Polygon Pictures, T. Nagasaki) — mocap
    「動きが生々しくなりすぎて（セルルックに）合わなくなる」.
    https://animeanime.jp/article/2017/10/06/35557.html
[^mocap2]: animeanime.jp (2022, *Tenjin*) — 「かなり手付けで動きを作っています」;
    hand-keying 「アニメっぽくなる」. https://animeanime.jp/article/2022/05/18/69566.html
[^orange1]: Autodesk AREA Japan case study — Studio Orange (est. 2004, Eiji
    Inomoto); "natural fusion" (自然な融合) of 3DCG and hand-drawn cel.
    https://area.autodesk.jp/why_3dcg/orange.html
[^orange2]: Agency for Cultural Affairs Media Arts database — 宝石の国 (2017) as
    Orange's first 元請 work; conventional cel-look CG characters.
    https://mediag.bunka.go.jp/article/13643-2/
[^orange3]: English Wikipedia, "Orange (animation studio)" — *Land of the
    Lustrous* praised for CG animation; VFX-Japan Awards 2018.
    https://en.wikipedia.org/wiki/Orange_(animation_studio)
[^camo1]: Media Arts database — "Camera-O-Matic" automatically morphs/distorts 3D
    models per camera angle to apply perspective / handle アオリ shots.
    https://mediag.bunka.go.jp/article/13643-2/
[^camo2]: Anime News Network — Sakura-Con 2023 *Trigun Stampede* making-of panel:
    "a program for warping the model" so CG doesn't look strange as the camera
    shifts. https://www.animenewsnetwork.com/convention/2023/sakura-con/orange-reveals-the-making-of-trigun-stampede/.196922
[^engine1]: CGWORLD — *HELLO WORLD* custom shader + 3ds Max/After Effects/Unity;
    staff friction over ゲームエンジンとアニメ制作の概念の違い.
    https://cgworld.jp/feature/202001-cgwcc-hw.html
[^engine2]: ss-agent.jp — *あした世界が終わるとしても* Unity pipeline (text storyboard →
    text movie → layout movie → primary movie) reducing rendering time.
    https://ss-agent.jp/column/game/g14-unity-anime/
[^blender1]: VIDEO SALON (Genkosha), Jan 2023 issue — feature
    「Blenderで作る3DCGセルルックアニメの世界」. https://videosalon.jp/blog/videosalon202301_3dcg_anime/
[^trend1]: animeanime.jp (2022) — Imagica Digital Scape: セルルックのアニメを3DCGで作る
    タイトルが増加傾向にあり. https://animeanime.jp/article/2022/05/18/69566.html
[^refute1]: **Refuted (1-2).** Claim that cel-look works are made to be "mistaken
    for" 2D — overstates the goal of resemblance. Source contested:
    https://videosalon.jp/blog/videosalon202301_3dcg_anime/
[^refute2]: **Refuted (1-2).** Claim that Maya + Pencil+ 4 is *the* standard
    teaching pipeline — single-tutorial framing did not generalize.
    https://area.autodesk.jp/column/tutorial/celllook-character-modeling/
[^genshin1]: **Unverified lead.** Chinese technical breakdown of *Genshin Impact
    (原神)* — facial shading via normal-map editing/correction (+AO), traced to the
    Japanese model-normal-editing method. https://www.163.com/dy/article/FMQ1GGLO0526DPBA.html
[^genshin2]: **Unverified lead.** Same source — distance-layered shadow
    implementations (lightmap+LOD, light probes, projected terrain shadows).
    https://www.163.com/dy/article/FMQ1GGLO0526DPBA.html

*Additional Korean/Chinese sources consulted but not substantiated:
gcores.com/articles/127114 (Chinese), namu.wiki 카툰 렌더링 (Korean wiki),
zhihu.com (Chinese Q&A).*
