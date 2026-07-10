# A Survey of 3D Animation Rigging Systems

*Technical survey — 2026-07-09*

*Compiled from a fan-out / adversarially-verified deep-research pass (5 search
angles, 21 sources fetched, 91 candidate claims extracted, 25 verified 3-0 by
independent adversarial vote). Each factual claim below is footnoted to a
primary source where one survived verification. Where the research pass could
not corroborate a point it is flagged as **[unverified]** or **[domain
knowledge]** so the reader can weigh it accordingly.*

---

## 0. Executive summary

Production 3D rigging has converged, across the two studios that publish the
most about it, on a single architectural idea: **separate the rich, editable
authoring rig from a fast, minimal evaluation representation, and evaluate that
representation on a multithreaded dependency graph.** Pixar's **Presto** and
DreamWorks' **Premo** (on the **LibEE/LibEE2** graph engine) are both built this
way from the ground up, and Autodesk **Maya** retrofitted the same idea in 2016
with its parallel **Evaluation Manager**.[^premo][^libee2][^presto][^parallelmaya]

The *style* a studio is chasing dictates what sits on top of that engine:

- **Pixar/DreamWorks "fluid" animation** wants continuous, volume-preserving,
  squash-and-stretch deformation. This is delivered by *layered* deformation
  stacks — curve-based facial deformers, muscle/jiggle/relax skin passes with
  explicit volume-preservation limits, and detail-preserving smoothers like
  Delta Mush — sitting above IK/FK limbs that can stretch.[^dwface][^muscle][^deltamush][^rigify]

- **Japanese cel-look CG** wants the *opposite* of continuous: it wants the
  discrete, imperfect, hand-posed read of 2D animation. The canonical
  first-party account (Arc System Works' *Guilty Gear Xrd*) describes ~500-bone
  rigs, **interpolation deliberately turned off** (every frame hand-posed), and
  **simulation deliberately refused** because physical continuity "reads as
  3D."[^ggxrd_gdc][^ggxrd_pdf]

- A **convergent / iterative (cyclic) dependency-graph solve** is required
  whenever the rig contains a genuine feedback loop that a single evaluation
  pass cannot resolve: cyclic constraint networks, spline-IK-with-hooks,
  muscle/skin relaxation, and (increasingly) bi-directional "invertible" rig
  components and neural IK. The dominant industry strategy is to keep each
  object's graph **acyclic** and emulate the loop by **repeated ordered
  re-evaluation to equilibrium or a fixed iteration count**, rather than by
  admitting true cycles into the graph.[^patent][^parallelmaya][^blenderspline][^rtlive]

---

## 1. What the industry actually uses

### 1.1 The two-tier pattern (authoring rig → evaluation graph)

Every high-end system distinguishes the **authoring rig** an artist edits from
the **evaluation form** the animator scrubs. The reason is that the two have
opposite requirements: authoring wants rich, redundant, human-legible structure;
evaluation wants a lean, parallelizable data-flow graph.

DreamWorks' **LibEE 2** makes this explicit. It builds a *dual representation*:
one graph for authoring (Nodes / Attributes / Connections) and a separate graph
for evaluation (Tasks / Dependencies). As a rigger edits the authoring
representation, the evaluation representation is updated in lockstep. Premo
"load[s] a full-fidelity editable production rig and translate[s] it on-the-fly
into a fast animation representation," reporting roughly a **100× authoring
speedup** from this split.[^libee2][^premo]

Pixar's **Presto** uses the **Presto Execution System**, described as "a
high-performance computation engine used for real-time, full-fidelity character
rig evaluation," explicitly designed to exploit rising CPU core counts.[^presto]
Presto's lineage matters: it replaced Pixar's earlier *Marionette/menv* system,
which reportedly could not stretch models enough to animate Elastigirl in *The
Incredibles* — a squash-and-stretch requirement that helped force the new
engine.[^presto_wiki]

### 1.2 The three reference architectures

| System | Studio / vendor | Engine | Key architectural trait |
|---|---|---|---|
| **Presto** | Pixar (in-house, not sold) | Presto Execution System | Real-time full-fidelity multicore eval; now bi-directional *invertible rigs* + neural ML Posing[^presto][^rtlive] |
| **Premo** | DreamWorks (in-house; Academy Sci-Tech award) | LibEE / LibEE 2 | Dual authoring/eval graph; ~100× faster edits; multithreaded DAG[^premo][^libee2] |
| **Maya** | Autodesk (commercial, the industry default) | Dependency Graph + parallel Evaluation Manager (2016) | Node/plug DG retrofitted with a node-level Evaluation Graph for parallel eval[^parallelmaya][^mayadg] |

**Maya** is the commercial baseline the rest of the industry rigs against. Its
scene is a **Dependency Graph (DG)** of nodes connected at the *plug* (attribute)
level: data enters a node through input plugs, the node computes, results leave
through output plugs.[^mayadg] Classic Maya used *pull/dirty-propagation*: an
edit marks downstream plugs dirty, and values are recomputed lazily on demand.
That model is inherently serial and hard to parallelize.

Maya 2016's **parallel Evaluation Manager** fixes this by building a **node-level
Evaluation Graph (EG)** that encodes node-level dependencies, so that when a node
is evaluated *all its inputs have already been computed*. In steady state, "if
all a node's dependencies have been evaluated before we evaluate the given node,
pull evaluation will not be triggered," and **dirty propagation is turned off
until it is required again.** The EG is initially *built* using DG dirty
propagation, then that mechanism is disabled for the parallel run.[^parallelmaya]

**Blender** is the open-source counterpart, and its **Rigify** add-on is the
open reference for a production-grade meta-rig generator (see §2.3). Blender also
has its own dependency graph ("depsgraph") with the same acyclic constraint and
the same cyclic-dependency pitfalls (§4.2).

### 1.3 The frontier: bi-directional / invertible rigs and neural IK

Pixar has pushed Presto past the classic one-directional (controls → joints)
evaluation model. At SIGGRAPH Asia 2024 Real-Time Live! they described
**"invertible rigs"**: "a fundamentally new approach to rig construction: each
rig component can run bi-directionally, thus making the animation controls and
rig joints fully invertible at a fundamental level."[^rtlive] They also shipped
**ML Posing**, described as "the realization of the SIGGRAPH Asia 2023 paper
*Pose and Skeleton-aware Neural IK for Pose and Motion Editing* running live in a
production animation setting."[^rtlive][^mlposing]

Both are directly relevant to §4 (convergent solvers): invertibility and neural
IK are ways of solving the *inverse* problem (given a desired joint/end-effector
state, find the control values) that a forward-only DAG cannot express.

> **Caveat:** invertible rigs and ML Posing are demonstrated in Real-Time Live!
> settings; the research pass could not confirm they are shipped in a released
> *film's* production rigs as of this writing.

---

## 2. Requirements for "fluid" (Pixar/DreamWorks-style) animation

The Western feature aesthetic wants deformation that is **continuous,
volume-aware, and richly layered**. Rigs achieve this through a *stack* of
deformers, each refining the last, rather than one monolithic skin.

### 2.1 Layered facial deformation

DreamWorks' facial system is the clearest published example. It is described as
**"a highly layered Deformation System using a new curve-based deformer type at
its base,"** coupling "a new in-house motion system approach ... with a curve-
based pose-interpolation system in a layered deformation rigging system." The
payoff is more available facial shapes and finer animator control, and it was
deployed in film production via Premo.[^dwface]

The pattern generalizes: base motion → curve/pose interpolation → layered
corrective deformation. Each layer is a graph node, which is exactly why the
underlying engine must be a fast dependency graph (§1.1).

### 2.2 Volume-preserving skin: muscle, jiggle, relax, and detail preservation

**Maya Muscle** is the archetypal unified skin deformer for this style. It
layers four passes on one mesh:

1. **Sticky** — rigid attachment,
2. **Sliding** — muscle/bone sliding under skin,
3. **Jiggle** — secondary dynamic motion,
4. **Relax** — smoothing of the result.

Squash-and-stretch volume preservation is driven by **explicit min/max length
settings**: "By default, the muscle's minimum squash is set to half its original
length, and its maximum stretch is set to double its original length. When the
muscle length changes to these settings, you get the maximum amount of volume
change."[^muscle]

> **Caveat:** Maya Muscle is now a **legacy/deprecated** feature. Its
> architecture remains an accurate illustration of the requirements, but it is
> no longer Autodesk's recommended path, and the modern standard for
> volume-preserving squash-and-stretch in current DCC tools is an open question
> (see §5).

**Delta Mush** is the complementary detail-preservation tool. Originating as
Rhythm & Hues' *Voodoo* deformer and now native in Maya (since ~2016), it
"smooths arbitrary deformations applied to a polygonal mesh, without smoothing
the original detail of the model."[^deltamush] Mechanically it caches per-vertex
**delta offsets** in a smoothed reference frame, then re-applies those deltas
after smoothing the *deformed* mesh — so skinning artifacts vanish while sculpted
surface detail survives. It is a cheap way to get near-corrective-shape quality
without hand-sculpting every pose.

### 2.3 The open-source reference: Blender Rigify

Rigify shows the same requirements met in open tooling. Its limb rigs provide:

- an **IK–FK blend slider** (full IK at 0, full FK at 1) with IK↔FK **snapping
  buttons** so an animator can switch modes without a pop;[^rigify]
- an **IK Stretch slider** blending between the limb "stretching freely at 1, or
  having its maximum length constrained at 0" — i.e. opt-in cartoon stretch;[^rigify]
- a **Spline Tentacle** sub-rig (built on **Spline IK**) with *Stretch-To-Fit*
  and *Manual Squash & Stretch* modes, where "all bones of the sub-rig deform
  chain follow the curve and squash & stretch to match."[^rigify]

The recurring primitives of fluid animation are therefore: **IK/FK blend +
snap**, **opt-in stretch with volume preservation**, **spline-driven squash**,
and a **layered corrective/smoothing deformer stack** on top.

---

## 3. Requirements for Japanese cel-look CG

The brief asked to prioritize **actual industry experience over academic NPR
papers**, and the strongest first-party production account by a wide margin is
Arc System Works' ***Guilty Gear Xrd*** — documented in Junya Motomura's 2015
GDC / CEDEC talk. (This is a real limitation: the research pass could *not*
verify comparable first-party technical detail for Studio Orange, Polygon
Pictures, Studio Khara, Marza, or the Blender open movies — see §5. Treat this
section as one deep, excellent, but narrow case study, whose UE3/2014 specifics
may not fully generalize to modern cel pipelines.)

### 3.1 The thesis: "full 2D style all the way to the rig"

Xrd's stated mission was to "rebuild a classic 2D fighting game within a modern
full-3D graphical framework, while maintaining all of its old-school 2D
charms."[^ggxrd_gdc] Critically, the 2D discipline was pushed *down into the
rig*, not bolted on at the shader. The technical requirements that follow are
essentially the **inverse** of §2:

### 3.2 Very high bone counts for per-feature hand control

"The bone count is around 500 per character on average ... the animator can move
every feature of the model on a frame-by-frame basis."[^ggxrd_pdf] Where a fluid
rig hides complexity behind a few IK controls, a cel rig **exposes** enormous
manual control so an animator can cheat silhouette and line on every single
frame — the 2D animator's prerogative.

### 3.3 Interpolation deliberately disabled ("every frame is a keyframe")

The defining choice: "we just stopped using interpolations between key frames.
Every frame now is a key frame ... You could imagine stop-motion animations."
Interpolation was rejected specifically because smooth in-betweening "makes it
look more 3D."[^ggxrd_pdf] This is a hard requirement that *contradicts* the
Western engine goal of continuous, scrubable motion — the cel pipeline wants
**discrete, on-twos/on-threes, hand-authored frames**.

### 3.4 Intentional imperfection via per-frame mesh deformation

"The secret is to deform the mesh every keyframe, to add imperfection."[^ggxrd_pdf]
2D animation is never perfectly consistent frame to frame; a mathematically
perfect 3D mesh reads as sterile CG. So the rig is used to introduce *deliberate*
per-frame inconsistency — the opposite of the volume-*conserving*, physically-
plausible deformation of §2.2.

### 3.5 Squash-and-stretch via scale animation (built by hand)

Xrd leaned "a LOT" on **scale animation** for squash-and-stretch and for
perspective/foreshortening exaggeration. Because their engine (UE3) "didn't
support it, so we had to implement the scaling system by ourselves."[^ggxrd_pdf]
Note the contrast with §2: both styles want squash-and-stretch, but the cel
approach gets it from **direct per-bone scale keys** an animator dials by eye,
not from volume-preserving muscle math.

### 3.6 No simulation, by design

"No simulation was used, because again, it just doesn't look 2D."[^ggxrd_pdf][^ggxrd_gdc]
Cloth, hair, and jiggle sims produce physically continuous secondary motion that
immediately reads as 3D. Cel pipelines hand-animate secondary motion instead.
This is the single sharpest divergence from the Western fluid pipeline, which
*adds* simulation and jiggle layers to enrich motion.

### 3.7 Design implications for a rigging engine

If a framework wants to serve cel-look work, the requirements are almost a
photo-negative of the fluid checklist:

- **Stepped/constant interpolation as a first-class citizen**, not an
  afterthought — the animator must be able to work "every frame is a key."
- **Cheap, dense, per-feature bone control** (hundreds of bones) with fast
  posing, not a small IK control set.
- **Direct scale channels** on bones for hand-keyed squash-and-stretch and
  perspective cheats.
- **No mandatory volume preservation** — imperfection is a feature.
- **No dependency on simulation** for secondary motion.

---

## 4. When you need a convergent / cyclical dependency-graph solver

A normal rig evaluates as a **DAG**: controls flow to joints flow to deformers,
each computed once per frame. A **convergent/iterative solver** becomes necessary
precisely when the rig contains a **feedback loop** — a value that depends,
directly or transitively, on itself — that a single topological pass cannot
resolve. The industry's response is nuanced, and mostly *avoids* true cycles.

### 4.1 The dominant strategy: keep the graph acyclic, iterate to equilibrium

The most important verified finding for this section comes from a DreamWorks
patent (US 2014/0035908). DreamWorks evaluates cyclic constraint relationships
**not** by building a cyclic graph, but by **running multiple ordered evaluation
passes until the system reaches equilibrium or a fixed iteration count** — an
iterative/convergent solve layered on top of DAGs. Cross-object cyclic
dependencies (character ↔ prop ↔ character) are handled by letting the animator
**specify a repeated evaluation order across the separate DAGs**, rather than
merging them into one cyclic graph.[^patent]

The stated rationale is a general design principle worth internalizing:

> Keeping each object's dependency graph **acyclic is a deliberate design
> choice** that simplifies building a deterministic evaluation plan, with cyclic
> behavior **emulated via multi-pass re-evaluation** instead.[^patent]

Maya takes a structurally similar approach at the engine level: it handles cycles
in the evaluation graph by **grouping the mutually-dependent nodes into a cluster
that is evaluated serially** before parallel evaluation resumes around it.[^parallelmaya][^mayadg]
The cycle is quarantined, not embraced.

### 4.2 The failure mode when you *don't* have a convergent solver

Blender is the cautionary example. Combining **Spline IK** on an armature with
**Hook modifiers** on the driving curve (hooks driven by the *same* armature's
bones) creates a real cyclic dependency: the curve depends on the armature and
the armature depends on the curve.[^blenderspline] Blender's depsgraph **does not
converge or iteratively solve** this loop — it produces a **one-frame lag /
incorrect update** rather than a resolved feedback solve.[^blenderspline] The
practical fix is a **dual-armature setup** (separate deformation and control
armatures) that *breaks* the loop — again, avoidance rather than solving.[^blenderspline]

This is the key diagnostic: **if your rig exhibits one-frame lag, oscillation, or
order-dependent results, you have an unresolved cycle** that needs either an
iterative solver or a topological refactor to break the loop.

### 4.3 Concrete situations that require iteration

Drawing the verified findings together, a convergent/iterative solve is called
for in these cases:

1. **Cyclic constraint networks** — two or more objects/bones that mutually
   constrain each other (A aims at B while B aims at A; character-holds-prop-
   holds-character). Solved by ordered multi-pass re-evaluation to
   equilibrium.[^patent]

2. **Inverse kinematics**, especially iterative solvers. **FABRIK** (Forward And
   Backward Reaching IK) reformulates joint positioning as *finding a point on a
   line* and solves the chain in **two alternating passes** (forward + backward)
   until convergence. It avoids the singularities and oscillations of
   Jacobian/matrix IK, converges quickly, and — in its extended form — handles
   **joint constraints, closed-loop chains, multiple end-effectors, and
   unreachable targets, with a convergence proof.**[^fabrik] Closed-loop chains
   and multi-end-effector bodies are exactly the cases a single forward pass
   cannot solve.

3. **Spline / Spline-IK solves**, where bone transforms must be fit to a curve
   whose shape may itself be influenced by those bones (the Blender hook case in
   §4.2, and Rigify's Spline Tentacle in §2.3). Fitting-to-a-curve is naturally
   iterative when the curve is not fully independent of the chain.

4. **Muscle / skin / jiggle / relax feedback layers.** The relax pass smooths a
   result that later passes depend on; jiggle integrates dynamic state over time.
   These are iterative *relaxation* and *integration* steps, not one-shot
   evaluations (§2.2).[^muscle]

5. **Bi-directional / invertible rigs and neural IK.** Pixar's invertible rig
   components run "bi-directionally," making controls and joints *mutually*
   solvable, and ML Posing runs neural IK live in the rig.[^rtlive][^mlposing]
   Solving for controls from a desired pose is an inverse problem — the general
   reason a forward DAG is insufficient and some form of iterative or learned
   solver is required.

### 4.4 Design guidance for a framework

The consistent industry lesson is a layered stance:

1. **Default to an acyclic graph** with deterministic single-pass evaluation —
   it is faster, parallelizable, and easier to reason about.[^patent][^parallelmaya]
2. **Detect cycles** and, rather than silently producing one-frame lag,
   *quarantine* them into serially-evaluated clusters.[^parallelmaya]
3. **Provide an explicit iterative/convergent solve** for the genuine feedback
   cases (cyclic constraints, IK, spline fits, muscle relaxation) with a
   **fixed-iteration or equilibrium stopping criterion**.[^patent][^fabrik]
4. **Offer topological escape hatches** (dual-armature / control-vs-deform
   separation) so authors can break a loop instead of paying for a solve.[^blenderspline]
5. **Consider bi-directional/invertible components** for the inverse-pose
   problem, if you can afford the machinery.[^rtlive]

---

## 5. Gaps, caveats, and open questions

This survey is only as strong as its verified sources; the honest boundaries:

- **The cel-look evidence is one deep case study.** *Guilty Gear Xrd* (2015,
  UE3) is first-party and excellent, but the pass could **not** verify
  comparable technical detail for **Studio Orange** (*Land of the Lustrous*,
  *Trigun Stampede*, *BEASTARS*), **Polygon Pictures**, **Studio Khara**, or
  **Marza**, nor for **Blender open-movie** cel pipelines. Orange is known
  (secondary sources) to be a heavy Blender-based 3D-anime house, but no
  first-party rig detail survived verification. Xrd's specifics may not
  generalize to film/streaming cel pipelines a decade later. **This is the
  biggest gap.**

- **The DreamWorks facial finding rests on a single first-party paper** with no
  independent corroboration in the verified set.[^dwface]

- **Maya Muscle is deprecated.** The architecture is accurate but no longer the
  recommended path; the *current* volume-preservation standard in modern DCC
  tools is unresolved here.

- **Invertible rigs / ML Posing are Real-Time Live! demos**, not confirmed
  shipped-film deployments.[^rtlive]

- **Several primary sources were paywalled/403** (Premo ACM page, LibEE2 PDF,
  Rigify manual) and were confirmed via search snippets rather than a direct
  visual read — the quotes are verified against snippets, not re-fetched pages.

**Open questions worth a follow-up pass:**

1. How do cel-look studios *beyond* Arc System Works (Orange, Polygon Pictures,
   Khara, Marza) actually structure rigs and toolchains, and how do Blender
   open-movie cel pipelines compare?
2. What is the *current* (post-Muscle) volume-preservation / squash-and-stretch
   deformation standard in Maya and modern DCC tools?
3. For Pixar's invertible rigs: is inversion solved **analytically per-component**
   or via an **iterative solver**, and how does bi-directional evaluation coexist
   with an otherwise-acyclic graph?

---

## Sources

Verified primary sources (survived 3-0 adversarial verification):

[^premo]: Gong, O'Neill, Forgrave, Kwa et al., *Premo: Powerful Character
Rigging, Fast Animation* (DreamWorks, SIGGRAPH Talk).
<https://dl.acm.org/doi/fullHtml/10.1145/3587421.3595468> ·
<https://history.siggraph.org/learning/premo-powerful-character-rigging-fast-animation-by-bryson-gong-oneill-forgrave-kwa-et-al/>

[^libee2]: Stuart Bryson, *LibEE 2: Rich Authoring and Fast Evaluation*
(DreamWorks Research). <https://research.dreamworks.com/wp-content/uploads/2018/08/talk_libee2-Edited.pdf>

[^presto]: SIGGRAPH Asia 2019 course session (Pixar), on the Presto Execution
System. <https://sa2019.siggraph.org/attend/courses/session/18/details/28>

[^presto_wiki]: *Presto (animation software)*, Wikipedia (secondary — Marionette
/ Elastigirl stretch background). <https://en.wikipedia.org/wiki/Presto_(animation_software)>

[^rtlive]: Pixar, SIGGRAPH Asia 2024 Real-Time Live! — invertible rigs + ML
Posing. <https://dl.acm.org/doi/10.1145/3681757.3697056>

[^mlposing]: *Pose and Skeleton-aware Neural IK for Pose and Motion Editing*,
SIGGRAPH Asia 2023 (the paper ML Posing realizes).
<https://dl.acm.org/doi/10.1145/3610548.3618217>

[^dwface]: DreamWorks, layered curve-based facial deformation system (SIGGRAPH
2015 Talk). <https://dl.acm.org/doi/10.1145/2791261.2791262>

[^muscle]: Autodesk, *Maya Muscle Advanced Techniques* (Sticky/Sliding/Jiggle/
Relax; min/max squash-stretch volume preservation).
<https://images.autodesk.com/adsk/files/mayamuscleadvancedtechniques.pdf>

[^deltamush]: Mancewicz, Derksen, Rijpkema, Wilson, *Delta Mush: Smoothing
Deformations While Preserving Detail* (Rhythm & Hues; DigiPro/SIGGRAPH 2014).
<https://www.researchgate.net/publication/266659626_Delta_mush_smoothing_deformations_while_preserving_detail>

[^rigify]: Blender Manual, *Rigify Rig Features* (IK/FK slider + snap, IK
Stretch, Spline Tentacle squash & stretch).
<https://docs.blender.org/manual/en/latest/addons/rigging/rigify/rig_features.html>

[^ggxrd_gdc]: Junya C. Motomura (Arc System Works), *Guilty Gear Xrd's Art Style:
The X Factor Between 2D and 3D*, GDC Vault.
<https://www.gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The>

[^ggxrd_pdf]: Junya C. Motomura, *Guilty Gear Xrd* technical talk slides
(~500 bones, interpolation disabled, per-frame deform, custom scale system, no
simulation). <https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf>

[^parallelmaya]: Autodesk, *Using Parallel Maya* (2026 ed.) — Evaluation Manager,
node-level Evaluation Graph, dirty-propagation disable, cycle clustering.
<https://damassets.autodesk.net/content/dam/autodesk/www/html/using-parallel-maya/2026/UsingParallelMaya.html>

[^mayadg]: Autodesk Maya SDK, *About the Dependency Graph* (nodes/plugs, cyclic
non-parenting connections). <https://help.autodesk.com/cloudhelp/2022/ENU/Maya-SDK/Dependency-graph-plug-ins/About-the-dependency-graph.html>

[^patent]: DreamWorks, US Patent Application 2014/0035908 — cyclic constraint
evaluation via repeated ordered passes to equilibrium / fixed iteration count.
<https://patents.google.com/patent/US20140035908>

[^fabrik]: Aristidou & Lasenby et al., *Extending FABRIK with constraints,
closed-loop chains, multiple end-effectors* (iterative two-pass IK, convergence
proof). <https://joanllobera.github.io/teaching/animation-foundations/12.03.fabrikconstraints_article.pdf>

[^blenderspline]: Blender Artists forum, *Spline IK cyclic dependency* — hook +
Spline IK feedback loop, one-frame lag, dual-armature workaround.
<https://blenderartists.org/t/spline-ik-cyclic-dependency/655591>

---

*Method note: produced by a 5-angle fan-out research workflow (103 agent calls,
~3.75M tokens). 91 candidate claims were extracted from 21 fetched sources; the
top 25 were each verified by 3 independent adversarial voters (2/3 refutes would
kill a claim). All 25 survived 3-0. Claims not carried by a verified source are
marked [unverified]/[domain knowledge] inline.*
