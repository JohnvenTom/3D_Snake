<p align="center">
  <img src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Isometric%203D%20neon%20green%20snake%20made%20of%20cubes%20in%20a%20dark%20cube%20arena%20with%20glowing%20orange%20food%20sphere%20and%20red%20obstacle%20blocks%2C%20neon%20brutalist%20arcade%20style%2C%20dark%20background%20with%20grid%20lines%2C%20volumetric%20lighting%2C%20cyberpunk%20aesthetic%2C%20high%20quality%203D%20render&image_size=landscape_16_9" width="100%" alt="3D Snake Banner">
</p>

<h1 align="center">
  <strong>3D SNAKE</strong>
</h1>
<p align="center">
  <em>XYZ Axis-Aligned Grid System // Neon Brutalist Arcade</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Three.js-r128-1a1a1a?style=flat-square&logo=three.js&logoColor=white" alt="Three.js">
  <img src="https://img.shields.io/badge/ES%20Modules-Native-0d1117?style=flat-square&logo=javascript&logoColor=f7df1e" alt="ES Modules">
  <img src="https://img.shields.io/badge/Zero%20Build-Open%20in%20Browser-c8ff00?style=flat-square&color=0d1117" alt="Zero Build">
  <img src="https://img.shields.io/badge/License-MIT-555?style=flat-square" alt="License">
</p>

---

## The Concept

> **把经典贪吃蛇从二维平面撕开，扔进一个 29x29x29 的三维立方体空间。**

蛇的移动严格锁定 **XYZ 三轴正交方向**——没有斜向、没有插值漂移。每一个实体（蛇身节、食物、障碍物）都栖息在整数格点上。逻辑层是离散的确定性判定；渲染层则是帧率无关的动态 lerp 插值，让每一次步进都如丝绸般顺滑。

这不是一个 demo。这是一台完整的街机。

---

## Architecture at a Glance

```
index.html                    ← Single entry point (no bundler)
│
├── css/style.css             ← Neon Brutalist design system + VFX keyframes
│
└── js/                       ← 14 ES Modules, single-responsibility
    │
    ├── main.js               → DOM binding & global event bus
    ├── config.js             → 40+ tunable parameters, centralized
    ├── state.js              → Singleton state object, shared by reference
    │
    ├── game.js               → Game loop / lifecycle / pause machine
    ├── scene.js              → Three.js scene initialization
    ├── camera.js             → Orbital camera + shake integration
    │
    ├── snake.js              → Segment system (spawn / grow / lerp)
    ├── food.js               → Food spawner + XYZ axes animation FSM
    ├── obstacles.js          → K-means clustering + 8 shape templates
    ├── collision.js          → Grid-coordinate exact-match detection
    │
    ├── controls.js           → Dual-mode input (WORLD / CAMERA)
    ├── effects.js            → 5-layer eat VFX composition engine
    ├── ui.js                 → Real-time panel data sync
    └── utils.js              → Direction utils / easing functions
```

**Design principles:**
- `logic ≠ render` — 网格坐标负责精确判定，lerp 负责视觉欺骗
- `frame-rate agnostic` — `performance.now()` deltaTime 贯穿全链路
- `effect lifecycle pool` — 创建 → 逐帧 update → 到期 auto-dispose，零泄漏
- `single source of truth` — `state.js` 唯一状态对象，所有模块引用共享

---

## Feature Matrix

### Spatial Engine

| Layer | Mechanism |
|:------|:----------|
| **Coordinate** | Integer grid (x, y, z ∈ ℤ), arena = [-14, 14]³ |
| **Movement** | 6-DOF axis-locked (±X, ±Y, ±Z), no diagonal |
| **Interpolation** | Dynamic lerp per-frame, coefficient = `1 - (1 - k)^(dt * 60)` |
| **Collision** | Exact integer match — zero floating-point error surface |

### Control Dualism

<details>
<summary><b>WORLD Mode</b> — 固定坐标轴映射</summary>

| Key | Axis |
|:---:|:----:|
| W / ↑ | −Z (forward) |
| S / ↓ | +Z (backward) |
| A / ← | −X (left) |
| D / → | +X (right) |
| Q | +Y (ascend) |
| E | −Y (descend) |

*适合对三维空间有直觉的玩家。*
</details>

<details>
<summary><b>CAMERA Mode</b> — 屏幕空间吸附</summary>

| Key | Mapping |
|:---:|:--------|
| W / ↑ | Screen up → snap to nearest axis |
| S / ↓ | Screen down → snap to nearest axis |
| A / ← | Screen left → snap to nearest axis |
| D / → | Screen right → snap to nearest axis |
| Q | Away from camera (into depth) |
| E | Toward camera (out of depth) |

*按键方向自动吸附到最近的 XYZ 主轴，更符合直觉操作。*
</details>

> `Tab` — 实时切换模式 &emsp;|&emsp; `Esc` / `P` — 暂停/恢复 &emsp;|&emsp; 长按 `Space` — 2x 加速冲刺

### Camera System

球坐标系轨道相机围绕蛇头运动，**双级独立插值**：

- **Position lerp** — 相机空间位置平滑过渡（`CAMERA_LERP_FACTOR = 0.08`）
- **Target lerp** — lookAt 目标点平滑跟随蛇头
- **Shake overlay** — 三组震屏偏移实时叠加：
  - `getShakeOffset()` — 高频多轴位移抖动（三频正弦叠加）
  - `getShakeRotation()` — Z 轴扭转偏移
  - `getShakeZoomPunch()` — 弹性镜头推拉（过冲+收敛）

俯仰角硬限位 `[0.15, π - 0.15]` 防止万向锁。

### Obstacle Generation Engine

每局游戏生成 **3 个结构化障碍物块**，采用两阶段算法：

```
Phase 1: K-means Cluster Center Selection
├── Random candidates within ARENA_SIZE bounds
├── Constraint: Manhattan(snake_head) ≥ 6
├── Constraint: Distance(cluster_i, cluster_j) ≥ 12
└── Max attempts: 1000 (fallback graceful degradation)

Phase 2: Shape Template Instantiation
├── 8 predefined geometric templates (randomly selected)
│   ├── cross      — 十字形 (16 units)
│   ├── lshape     — L 形拐角 (16 units)
│   ├── tshape     — T 形横梁 (18 units)
│   ├── zigzag     — Z 形折线 (18 units)
│   ├── corner     — U 形围栏 (20 units)
│   ├── plus       — 加号星形 (24 units)
│   ├── staircase  — 阶梯上升 (16 units)
│   └── diagonal   — 斜向团块 (22 units)
├── Each template: unique contour, 3D spatial morphology
└── Output: obstacleGridPositions[] → collision.js consumes
```

### VFX Composition Engine

每次进食触发 **五层同步特效管线**：

```
triggerEatEffects(foodPosition)
│
├─ Layer A: Particle Burst (72 particles, 2 layers)
│   ├─ Core sparks (16): white-gold, high-velocity radial, no gravity
│   └─ Debris shell (56): orange→green gradient, parabolic fall, drag decay
│
├─ Layer B: Shockwave Rings (3 axial planes)
│   ├─ XY ring (coral orange) — radar sweep expansion
│   ├─ XZ ring (neon green) — delayed 50ms for rhythm
│   └─ YZ ring (electric blue) — delayed 100ms
│
├─ Layer C: Energy Beams (6 lines)
│   └─ food ↔ head connection, coral→green gradient, rapid pulse fade
│
├─ Layer D: Floating Score (+10 DOM text)
│   └─ 3D→screen projection, CSS keyframe float-up animation
│
└─ Layer E: Screen Flash + Camera Shake
    ├─ Phase 1 (0~8%):   Hard white flash, full opacity burst
    ├─ Phase 2 (8~30%):  Neon green radial glow, screen blend mode
    ├─ Phase 3 (30~100%): Residual falloff, cubic ease-out
    └─ Shake: tri-axis displacement + rotation + zoom punch
```

All effects managed by an **object-pool lifecycle**: `activeEffects[]` → per-frame `update(elapsed, progress)` → auto `dispose()` on expiry.

---

## Configuration Surface

<details>
<summary><b>Arena & Gameplay</b></summary>

| Parameter | Value | Domain |
|:----------|:-----:|:-------|
| `ARENA_SIZE` | `14` | Half-extent → total range [-14, +14] = 29³ grid |
| `GRID_UNIT` | `1.0` | Cell size in world units |
| `SEGMENT_SIZE` | `0.85` | Visual size per segment (< cell to avoid overlap) |
| `INITIAL_LENGTH` | `4` | Starting segments (head inclusive) |
| `BASE_MOVE_INTERVAL` | `0.28s` | Time per step at start |
| `SPEED_INCREMENT` | `0.008s` | Interval reduction per food eaten |
| `MIN_MOVE_INTERVAL` | `0.1s` | Speed ceiling (playability floor) |
| `SPEED_BOOST_MULTIPLIER` | `2.0x` | Space-bar boost ratio |
| `RENDER_LERP_FACTOR` | `0.5` | Base interpolation coefficient |
</details>

<details>
<summary><b>Camera Orbit</b></summary>

| Parameter | Value | Notes |
|:----------|:-----:|:------|
| `CAMERA_RADIUS` | `32` | Initial distance from head |
| `CAMERA_MIN_RADIUS` | `12` | Zoom-in limit |
| `CAMERA_MAX_RADIUS` | `60` | Zoom-out limit |
| `CAMERA_LERP_FACTOR` | `0.08` | Smoothing (lower = more inertia) |
| `CAMERA_ROTATE_SENSITIVITY` | `0.005` | Drag rotation gain |
| `CAMERA_ZOOM_SENSITIVITY` | `0.8` | Scroll wheel gain |
| `PHI limits` | `[0.15, π−0.15]` | Pitch clamp (anti-gimbal) |
</details>

<details>
<summary><b>Obstacle System</b></summary>

| Parameter | Value | Meaning |
|:----------|:-----:|:--------|
| `OBSTACLE_CLUSTER_COUNT` | `3` | Shape blocks per game |
| `SAFE_DISTANCE_FROM_SNAKE` | `6` | Manhattan safety radius |
| `MIN_CENTER_DISTANCE` | `12` | Inter-cluster separation |
| `OBSTACLE_SIZE` | `0.9` | Per-unit visual size |
| `COLOR_OBSTACLE` | `#8b0000` | Dark crimson red |
</details>

<details>
<summary><b>Color Palette</b></summary>

| Token | Hex | Role |
|:------|:---:|:-----|
| Background | `#0a0908` | Deep void black |
| Snake Head | `#c8ff00` | Neon lime (emissive) |
| Snake Body | `#7cb000` | Deep olive green |
| Food | `#ff5733` | Coral orange (glow) |
| Obstacle | `#8b0000` | Dark crimson |
| Boundary/Grid | `#c8ff00` | Neon lime accent |
</details>

All tunables live in a single file: [config.js](js/config.js). Change one value, reload.

---

## Quick Start

```bash
# Option 1: Just open it
open index.html

# Option 2: Local server (recommended for module loading)
npx http-server -p 3000
# → http://localhost:3000
```

**Zero dependencies. Zero build step. Zero configuration.**  
One HTML file, one browser tab, full experience.

---

## Game Flow

```
┌─────────────┐    ┌──────────────────┐    ┌──────────────┐
│  Launch     │──▶│                  │──▶│              │
│  Game       │    │   ACTIVE LOOP    │    │  Game Over   │
│  (Enter/Sp) │    │                  │    │  (3 reasons) │
└─────────────┘    └──────────────────┘    └──────────────┘
                         │                        │
                    ┌────┴────┐              ┌────┴────┐
                    │  Pause  │◀──(Esc/P)──▶│ Restart  │
                    │ (render │              │ (Enter/  │
                    │  only)  │              │  Space)  │
                    └─────────┘              └─────────┘
```

**Termination conditions:**
- `BOUNDARY` — head exits the [-14, 14]³ cube
- `SELF COLLISION` — head occupies any body segment's grid position
- `OBSTACLE HIT` — head collides with any obstacle block

---

## Tech Stack

| Layer | Technology | Rationale |
|:------|:-----------|:----------|
| **3D Engine** | Three.js r128 (CDN) | Mature, lightweight, no build tools needed |
| **Module System** | Native ES Modules (`import/export`) | Browser-native, zero bundler overhead |
| **Styling** | Vanilla CSS3 + Custom Properties | Full control, no framework bloat |
| **Typography** | Unbounded + Space Mono (Google Fonts) | Geometric brutalist headline + monospace UI |
| **VFX Pipeline** | Three.js Points/Rings/Lines + DOM overlays + CSS keyframes | Hybrid 3D-DOM approach for maximum visual impact |

---

## License

MIT © [tom1234567890](https://github.com/tom1234567890)

---

<p align="center">
  <sub>Built with precision. Played with instinct.</sub>
</p>
