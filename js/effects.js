/**
 * 吃食物特效模块
 * 管理蛇吃到食物时触发的所有视觉特效：粒子爆炸、冲击波环、能量吸收线、分数飘字、全屏闪光+震屏
 * 所有特效均采用对象池式生命周期管理：创建 → 逐帧更新 → 到期自动销毁
 *
 * @module effects
 */

import CONFIG from './config.js';
import state from './state.js';

// ==================== 常量定义 ====================

/** 粒子数量 — 内核火花 + 外围碎片双层 */
const PARTICLE_COUNT = 72;
/** 内核高亮粒子数量 */
const CORE_PARTICLE_COUNT = 16;
/** 粒子存活时长（秒） */
const PARTICLE_DURATION = 0.9;
/** 冲击波环存活时长（秒） */
const SHOCKWAVE_DURATION = 0.7;
/** 能量吸收线存活时长（秒） */
const BEAM_DURATION = 0.35;
/** 分数飘字存活时长（秒） */
const FLOAT_TEXT_DURATION = 1.0;
/** 震屏持续时长（秒） */
const SHAKE_DURATION = 0.5;
/** 震屏最大强度（世界单位）— 暴力模式 */
const SHAKE_INTENSITY = 1.0;
/** 震屏最大旋转幅度（弧度） */
const SHAKE_ROTATION_INTENSITY = 0.06;
/** 镜头推拉强度（相机距离偏移量） */
const SHAKE_ZOOM_PUNCH = 4.5;

// ==================== 活跃特效列表 ====================

/**
 * 活跃特效数组，每个元素为一个特效对象
 * 特效对象结构: { type: string, startTime: number, duration: number, objects: Array<THREE.Object3D>, update: Function }
 * 每帧由 updateEffects 遍历调用 update 并清理过期特效
 * @type {Array<Object>}
 */
const activeEffects = [];

// ==================== 工具函数 ====================

/**
 * 获取当前时间戳（秒），用于特效生命周期计时
 * @returns {number} 当前时间戳（秒，高精度）
 */
function now() {
    return performance.now() / 1000;
}

/**
 * 将 Three.js 世界坐标投影到屏幕 CSS 像素坐标
 * 用于将 3D 场景中的位置映射到 DOM 元素的屏幕定位
 * @param {THREE.Vector3} worldPos - 世界坐标位置
 * @returns {Object|null} 屏幕坐标 {x: number, y: number}，若在相机背后则返回 null
 */
function projectToScreen(worldPos) {
    if (!state.camera) return null;

    const vec = worldPos.clone().project(state.camera);
    // 投影坐标范围 -1~1，超出说明在相机背后或视野外
    if (vec.z > 1) return null;

    const container = state.dom.container;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    return {
        x: (vec.x * 0.5 + 0.5) * rect.width + rect.left,
        y: (-vec.y * 0.5 + 0.5) * rect.height + rect.top
    };
}

// ==================== 特效 A：粒子爆炸 ====================

/**
 * 创建粒子爆炸特效（双层：内核火花 + 外围碎片）
 *
 * 视觉层次设计：
 *   Layer 1 — 内核火花（16颗）：白热色、高速、大尺寸，模拟爆炸核心的高温喷射
 *   Layer 2 — 外围碎片（56颗）：橙绿渐变色、中速带重力和阻力，自然抛物线散落
 *
 * 物理特性：
 *   - 粒子速度随时间衰减（空气阻力），越往后越慢
 *   - 外围粒子受轻微重力影响，呈抛物线下坠
 *   - 内核粒子无重力，纯径向高速喷射
 *   - 每个粒子独立的大小和颜色，避免单调感
 *
 * @param {THREE.Vector3} position - 爆发中心的世界坐标
 * @returns {Object} 特效对象（含多个 Points 对象 + 中心闪光球）
 */
function createParticleBurst(position) {
    const allObjects = [];
    const allVelocities = [];

    // 食物色（珊瑚橙）
    const colorFood = new THREE.Color(CONFIG.COLOR_FOOD);
    // 蛇头色（荧光绿）
    const colorSnake = new THREE.Color(CONFIG.COLOR_SNAKE_HEAD);
    // 白热核心色
    const colorWhite = new THREE.Color(0xffffff);
    // 金黄色（中间过渡）
    const colorGold = new THREE.Color(0xffcc00);

    // ==================== Layer 1: 内核高亮火花 ====================
    {
        const count = CORE_PARTICLE_COUNT;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3]     = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;

            // 高速径向喷射（8~14 单位/秒），球形均匀分布
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 8 + Math.random() * 6;
            velocities.push({
                x: Math.sin(phi) * Math.cos(theta) * speed,
                y: Math.sin(phi) * Math.sin(theta) * speed,
                z: Math.cos(phi) * speed,
                // 每颗火花独立的基础大小（用于 update 时差异化缩放）
                baseSize: 0.28 + Math.random() * 0.22,
                // 是否为"拖尾型"粒子（更亮更长）
                isStreak: Math.random() > 0.5
            });

            // 颜色：白热 → 金黄 → 橙色 随机混合
            const colorRoll = Math.random();
            let c;
            if (colorRoll < 0.35) {
                c = colorWhite.clone();                    // 35% 纯白
            } else if (colorRoll < 0.7) {
                c = colorGold.clone().lerp(colorWhite, 0.4); // 35% 金白
            } else {
                c = colorFood.clone().lerp(colorGold, 0.5);   // 30% 橙金
            }
            colors[i * 3]     = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.38,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        const corePoints = new THREE.Points(geo, mat);
        state.scene.add(corePoints);
        allObjects.push(corePoints);
        allVelocities.push(...velocities);
    }

    // ==================== Layer 2: 外围碎片 ====================
    {
        const count = PARTICLE_COUNT - CORE_PARTICLE_COUNT;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3]     = position.x + (Math.random() - 0.5) * 0.15;
            positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.15;
            positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.15;

            // 中速喷射（3~8 单位/秒），方向略偏随机
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 3 + Math.random() * 5;
            velocities.push({
                x: Math.sin(phi) * Math.cos(theta) * speed,
                y: Math.sin(phi) * Math.sin(theta) * speed,
                z: Math.cos(phi) * speed,
                baseSize: 0.08 + Math.random() * 0.18,
                isStreak: false
            });

            // 颜色：珊瑚橙 → 荧光绿 渐变谱，每个粒子不同位置
            const t = Math.random();
            let c;
            if (t < 0.4) {
                c = colorFood.clone();                          // 40% 珊瑚橙
            } else if (t < 0.75) {
                c = colorFood.clone().lerp(colorSnake, t);      // 35% 橙绿混合
            } else {
                c = colorSnake.clone().lerp(new THREE.Color(0x4d7cff), (t - 0.75) * 4); // 25% 绿蓝尾
            }
            colors[i * 3]     = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.16,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        const debrisPoints = new THREE.Points(geo, mat);
        state.scene.add(debrisPoints);
        allObjects.push(debrisPoints);
        allVelocities.push(...velocities);
    }

    // ==================== Layer 3: 中心闪光球 ====================
    // 一个快速膨胀并消失的发光球体，作为爆炸的"起爆点"视觉锚点
    const flashGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const flashSphere = new THREE.Mesh(flashGeo, flashMat);
    flashSphere.position.copy(position);
    flashSphere.scale.setScalar(0.01); // 初始极小
    state.scene.add(flashSphere);
    allObjects.push(flashSphere);

    return {
        type: 'particle',
        startTime: now(),
        duration: PARTICLE_DURATION,
        objects: allObjects,
        /** @type {Array<{x:number,y:number,z:number,baseSize:number,isStreak:boolean}>} */
        data: allVelocities,

        /**
         * 更新粒子爆炸动画状态（每帧调用）
         * 分三层独立更新：
         *   - 内核火花：高速扩散+快速缩小+亮度骤降（前50%生命周期活跃）
         *   - 外围碎片：中速扩散+重力下落+空气阻力减速+缓慢淡出
         *   - 中心闪光球：瞬间膨胀到最大→收缩消失（仅前20%活跃）
         *
         * @param {number} elapsed - 特效已运行时间（秒）
         * @param {number} progress - 生命进度 0~1（0=刚创建, 1=即将销毁）
         * @returns {void}
         */
        update(elapsed, progress) {
            const dt = 1 / 60; // 固定时间步长保证一致性
            const vel = this.data;

            // --- 更新 Layer 1: 内核火花 (索引 0 ~ CORE_PARTICLE_COUNT-1) ---
            const coreObj = this.objects[0];
            const corePosAttr = coreObj.geometry.attributes.position;
            const corePosArr = corePosAttr.array;

            for (let i = 0; i < CORE_PARTICLE_COUNT; i++) {
                const v = vel[i];
                // 位置更新
                corePosArr[i * 3]     += v.x * dt;
                corePosArr[i * 3 + 1] += v.y * dt;
                corePosArr[i * 3 + 2] += v.z * dt;

                // 速度衰减（空气阻力）：每帧损失 3% 速度
                const drag = 0.97;
                v.x *= drag;
                v.y *= drag;
                v.z *= drag;
            }
            corePosAttr.needsUpdate = true;

            // 内核材质：前半段保持高亮，后半段快速熄灭
            if (progress < 0.5) {
                coreObj.material.opacity = 1.0;
                coreObj.material.size = 0.38 * (1 - progress * 0.6);
            } else {
                const fadeProgress = (progress - 0.5) / 0.5; // 0~1
                coreObj.material.opacity = 1 - fadeProgress * fadeProgress; // 二次方加速淡出
                coreObj.material.size = 0.38 * (1 - progress * 0.85);
            }

            // --- 更新 Layer 2: 外围碎片 (索引 CORE_PARTICLE_COUNT ~ PARTICLE_COUNT-1) ---
            const debrisObj = this.objects[1];
            const debrisPosAttr = debrisObj.geometry.attributes.position;
            const debrisPosArr = debrisPosAttr.array;
            const GRAVITY = -4.0; // 重力加速度（单位/秒²）

            for (let i = 0; i < PARTICLE_COUNT - CORE_PARTICLE_COUNT; i++) {
                const v = vel[CORE_PARTICLE_COUNT + i];
                const idx = i;

                // 位置更新
                debrisPosArr[idx * 3]     += v.x * dt;
                debrisPosArr[idx * 3 + 1] += v.y * dt;
                debrisPosArr[idx * 3 + 2] += v.z * dt;

                // 重力影响 Y 轴（外围碎片受重力下坠，产生抛物线轨迹）
                v.y += GRAVITY * dt;

                // 空气阻力：每帧损失 1.5% 速度
                const drag = 0.985;
                v.x *= drag;
                v.y *= drag;
                v.z *= drag;
            }
            debrisPosAttr.needsUpdate = true;

            // 外围材质：整体透明度用三次缓出曲线（前期持久，后期消散）
            const debrisOpacity = 1 - Math.pow(progress, 2.5);
            debrisObj.material.opacity = debrisOpacity;
            // 大小先略微膨胀再缩小（模拟散热过程）
            const sizePulse = progress < 0.25
                ? 1 + progress * 1.2          // 前段微胀
                : 1.3 - (progress - 0.25) * 0.9; // 后段收缩
            debrisObj.material.size = 0.16 * Math.max(0.3, sizePulse);

            // --- 更新 Layer 3: 中心闪光球 ---
            const flashObj = this.objects[2];
            if (progress < 0.18) {
                // 前段：从极小瞬间膨胀到最大（约 3 倍原始尺寸）
                const p = progress / 0.18;
                const expandEase = Math.sin(p * Math.PI * 0.5); // 0→1 平滑加速
                flashObj.scale.setScalar(0.01 + expandEase * 3.0);
                flashObj.material.opacity = 1.0 - p * 0.4; // 从 1.0 降到 0.6
            } else if (progress < 0.40) {
                // 中段：快速收缩并淡出
                const localP = (progress - 0.18) / 0.22;
                flashObj.scale.setScalar(3.0 * (1 - localP));
                flashObj.material.opacity = 0.6 * (1 - localP);
            } else {
                // 后段：完全隐藏
                flashObj.scale.setScalar(0.01);
                flashObj.material.opacity = 0;
            }
        },

        /**
         * 销毁粒子爆炸特效资源
         * 从场景移除所有 Points 和 Mesh 对象，释放几何体和材质内存
         * @returns {void}
         */
        dispose() {
            this.objects.forEach(obj => {
                state.scene.remove(obj);
                obj.geometry.dispose();
                obj.material.dispose();
            });
        }
    };
}

// ==================== 特效 B：冲击波环 ====================

/**
 * 创建冲击波环特效
 * 在食物位置生成三个轴向的霓虹圆环（XY/XZ/YZ 平面），像雷达波一样向外扩张并淡出
 * 与现有三轴辅助线风格高度统一
 *
 * @param {THREE.Vector3} position - 波纹中心的世界坐标
 * @returns {Object} 特效对象（含三个 Ring Mesh）
 */
function createShockwaveRings(position) {
    const rings = [];
    // 三轴平面配置：法向量 + 旋转角度
    const planes = [
        { axis: 'xy', rot: [0, 0, 0], color: CONFIG.COLOR_FOOD },           // XY面 - 珊瑚橙
        { axis: 'xz', rot: [Math.PI / 2, 0, 0], color: CONFIG.COLOR_SNAKE_HEAD }, // XZ面 - 荧光绿
        { axis: 'yz', rot: [0, 0, Math.PI / 2], color: 0x4d7cff }          // YZ面 - 电蓝
    ];

    planes.forEach(cfg => {
        // 使用 RingGeometry（扁平圆环）
        const geo = new THREE.RingGeometry(0.05, 0.15, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: cfg.color,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.position.copy(position);
        ring.rotation.set(...cfg.rot);
        ring.scale.setScalar(0.01); // 初始极小
        state.scene.add(ring);
        rings.push(ring);
    });

    return {
        type: 'shockwave',
        startTime: now(),
        duration: SHOCKWAVE_DURATION,
        objects: rings,

        /**
         * 更新冲击波环动画状态
         * 三个环依次延迟启动（错开节奏感），同时放大+淡出
         * @param {number} elapsed - 特效已运行时间（秒）
         * @param {number} progress - 生命进度 0~1
         * @returns {void}
         */
        update(elapsed, progress) {
            this.objects.forEach((ring, idx) => {
                // 每个环延迟 0.05s 启动，形成层次感
                const delay = idx * 0.05;
                const localProgress = Math.max(0, Math.min(1, (elapsed - delay) / (SHOCKWAVE_DURATION - delay)));

                if (localProgress <= 0) {
                    ring.scale.setScalar(0.01);
                    ring.material.opacity = 0;
                    return;
                }

                // 缓动曲线：先快后慢的扩张
                const eased = 1 - Math.pow(1 - localProgress, 2.5);
                // 扩张到约 4 倍原始尺寸
                ring.scale.setScalar(0.01 + eased * 4.0);
                // 透明度：中段最亮，两头暗（抛物线衰减）
                ring.material.opacity = 0.9 * Math.sin(localProgress * Math.PI);
            });
        },

        /**
         * 销毁冲击波环资源
         * 移除三个 Ring Mesh 并释放几何体和材质
         * @returns {void}
         */
        dispose() {
            this.objects.forEach(obj => {
                state.scene.remove(obj);
                obj.geometry.dispose();
                obj.material.dispose();
            });
        }
    };
}

// ==================== 特效 E：能量吸收线 ====================

/**
 * 创建能量吸收线特效
 * 在食物位置与蛇头之间生成多条霓虹光线，呈现"被吸走"的能量传输视觉效果
 * 科技感强，强调吃食物的能量流动感
 *
 * @param {THREE.Vector3} foodPosition - 食物的世界坐标（线的起点）
 * @param {THREE.Vector3} headPosition - 蛇头的世界坐标（线的终点）
 * @returns {Object} 特效对象（含多条 Line 对象）
 */
function createEnergyBeams(foodPosition, headPosition) {
    const lines = [];
    const beamCount = 6; // 光线数量

    for (let i = 0; i < beamCount; i++) {
        // 起点：食物位置加微小随机偏移（避免完全重合）
        const start = foodPosition.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
        ));

        // 终点：蛇头位置加微小偏移
        const end = headPosition.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15
        ));

        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);

        // 颜色：珊瑚橙 → 荧光绿 渐变（每条线不同混合比）
        const t = i / beamCount;
        const color = new THREE.Color(CONFIG.COLOR_FOOD).lerp(
            new THREE.Color(CONFIG.COLOR_SNAKE_HEAD), t
        );

        const mat = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            linewidth: 1
        });

        const line = new THREE.Line(geo, mat);
        state.scene.add(line);
        lines.push(line);
    }

    return {
        type: 'beam',
        startTime: now(),
        duration: BEAM_DURATION,
        objects: lines,

        /**
         * 更新能量吸收线动画状态
         * 快速闪烁后消失，模拟能量被瞬间吸收的效果
         * @param {number} _elapsed - 特效已运行时间（未使用，保留接口一致性）
         * @param {number} progress - 生命进度 0~1
         * @returns {void}
         */
        update(_elapsed, progress) {
            // 快速脉冲：前30%亮度最高，之后快速衰减
            let opacity;
            if (progress < 0.3) {
                opacity = 1.0;
            } else {
                opacity = 1.0 - ((progress - 0.3) / 0.7);
            }
            this.objects.forEach(line => {
                line.material.opacity = opacity;
            });
        },

        /**
         * 销毁能量吸收线资源
         * 移除所有 Line 对象并释放几何体和材质
         * @returns {void}
         */
        dispose() {
            this.objects.forEach(obj => {
                state.scene.remove(obj);
                obj.geometry.dispose();
                obj.material.dispose();
            });
        }
    };
}

// ==================== 特效 C：分数飘字 ====================

/**
 * 创建分数飘字特效
 * 在食物位置的屏幕投影处生成一个 "+10" 的 DOM 浮动文字
 * 使用 Unbounded 字体保持 UI 一致性，向上漂浮并淡出
 *
 * @param {THREE.Vector3} position - 飘字锚点的世界坐标
 * @returns {Object|null} 特效对象（若投影失败返回 null）
 */
function createFloatingScore(position) {
    const screenPos = projectToScreen(position);
    if (!screenPos) return null;

    // 创建 DOM 元素
    const el = document.createElement('div');
    el.className = 'float-score';
    el.textContent = '+10';
    el.style.left = `${screenPos.x}px`;
    el.style.top = `${screenPos.y}px`;
    document.body.appendChild(el);

    // 触发 CSS 动画（通过强制 reflow 确保 class 生效）
    void el.offsetWidth;
    el.classList.add('active');

    return {
        type: 'floatText',
        startTime: now(),
        duration: FLOAT_TEXT_DURATION,
        objects: [], // DOM 元素不归 Three.js 管理
        domElement: el,

        /**
         * 更新分数飘字动画状态
         * 主要由 CSS animation 驱动，此处仅负责到期清理
         * @param {number} _elapsed - 未使用
         * @param {number} _progress - 未使用
         * @returns {void}
         */
        update(_elapsed, _progress) {
            // 动画完全由 CSS keyframes 驱动，无需逐帧操作
        },

        /**
         * 销毁分数飘字 DOM 元素
         * 从 document.body 中移除飘字节点
         * @returns {void}
         */
        dispose() {
            if (this.domElement && this.domElement.parentNode) {
                this.domElement.parentNode.removeChild(this.domElement);
            }
        }
    };
}

// ==================== 特效 F：全屏闪光 + 震屏 ====================

/** 多层脉冲闪光总时长（秒） */
const FLASH_TOTAL_DURATION = 0.45;

/**
 * 触发多层脉冲全屏闪光效果
 * 采用 JS 驱动的三段式节奏，比纯 CSS 动画更精确可控：
 *   Phase 1 (0~8%)   : 强白闪 — 全白高亮覆盖，模拟街机打击的瞬间致盲感
 *   Phase 2 (8%~30%) : 荧光绿回光 — 从白过渡到荧光绿脉冲，带径向发光
 *   Phase 3 (30%~100%): 余辉消散 — 绿色光晕缓慢淡出，留下能量残留感
 *
 * 通过将闪光作为 activeEffect 管理，实现逐帧精确控制 overlay 的样式属性
 *
 * @returns {void}
 */
function triggerScreenFlash() {
    const flashEl = document.getElementById('flash-overlay');
    if (!flashEl) return;

    // 重置到初始状态
    flashEl.classList.remove('active');
    void flashEl.offsetWidth; // 强制 reflow 重置 CSS 动画

    // 创建 JS 驱动的闪光特效对象，加入活跃列表逐帧更新
    activeEffects.push({
        type: 'screenFlash',
        startTime: now(),
        duration: FLASH_TOTAL_DURATION,
        objects: [],
        domElement: flashEl,

        /**
         * 逐帧更新闪光覆盖层的视觉状态
         * 根据当前进度处于不同阶段，分别控制背景色、透明度和混合模式
         * @param {number} elapsed - 特效已运行时间（秒）
         * @param {number} progress - 生命进度 0~1
         * @returns {void}
         */
        update(elapsed, progress) {
            const el = this.domElement;

            if (progress < 0.08) {
                // === Phase 1: 强白闪 (0~8%) ===
                // 纯白全覆盖，最高亮度，营造"被击中"的视觉冲击
                const p = progress / 0.08;
                // 快速升到顶峰再开始下降
                const intensity = Math.sin(p * Math.PI * 0.5); // 0→1
                el.style.background = `rgba(255, 255, 255, ${intensity * 0.55})`;
                el.style.opacity = '1';
                el.style.mixBlendMode = 'normal';
            } else if (progress < 0.30) {
                // === Phase 2: 荧光绿回光 (8%~30%) ===
                // 白→绿过渡 + 径向发光，能量吸收后的颜色转换
                const localP = (progress - 0.08) / 0.22; // 归一化到 0~1
                // 先保持一段高强度再衰减：用 bell 曲线
                const bell = Math.sin(localP * Math.PI); // 0→1→0
                el.style.background = `
                    radial-gradient(
                        ellipse 120% 100% at center,
                        rgba(200, 255, 0, ${bell * 0.45}) 0%,
                        rgba(200, 255, 0, ${bell * 0.15}) 35%,
                        rgba(77, 124, 255, ${bell * 0.08}) 60%,
                        transparent 75%
                    )
                `;
                el.style.opacity = String(0.85 * bell + 0.15);
                el.style.mixBlendMode = 'screen';
            } else {
                // === Phase 3: 余辉消散 (30%~100%) ===
                // 缓慢淡出的绿色光晕残留
                const localP = (progress - 0.30) / 0.70; // 0~1
                const fade = 1 - localP; // 1→0
                const smoothFade = fade * fade * fade; // 三次缓出（更自然的消散）
                el.style.background = `
                    radial-gradient(
                        ellipse 150% 120% at center,
                        rgba(200, 255, 0, ${smoothFade * 0.12}) 0%,
                        rgba(200, 255, 0, ${smoothFade * 0.04}) 40%,
                        transparent 65%
                    )
                `;
                el.style.opacity = String(smoothFade);
                el.style.mixBlendMode = 'screen';
            }
        },

        /**
         * 闪光结束后重置 DOM 元素样式到默认状态
         * @returns {void}
         */
        dispose() {
            if (this.domElement) {
                this.domElement.style.background = '';
                this.domElement.style.opacity = '';
                this.domElement.style.mixBlendMode = '';
                this.domElement.classList.remove('active');
            }
        }
    });
}

/**
 * 触发暴力震屏效果（含位置抖动 + 旋转抖动 + 镜头推拉）
 * 通过设置 state.shakeState 对象通知 camera.js 在渲染时叠加三组偏移：
 *   - 位移偏移：XYZ 三轴随机高频抖动，指数衰减
 *   - 旋转偏移：Z 轴微转，模拟镜头被冲击的扭转感
 *   - 推拉偏移：相机距离先瞬间拉近再弹回，模拟"被击退"的视觉纵深
 *
 * @returns {void}
 */
function triggerCameraShake() {
    state.shakeState = {
        startTime: now(),
        duration: SHAKE_DURATION,
        intensity: SHAKE_INTENSITY,
        rotationIntensity: SHAKE_ROTATION_INTENSITY,
        zoomPunch: SHAKE_ZOOM_PUNCH
    };
}

// ==================== 公开 API ====================

/**
 * 触发完整的"吃到食物"特效组合
 * 同时激活全部五种特效：粒子爆炸、冲击波环、能量吸收线、分数飘字、全屏闪光+震屏
 * 此函数应在 gameLoop 的食物碰撞检测命中时调用
 *
 * @param {THREE.Vector3} foodPosition - 被吃掉的食物的世界坐标位置
 * @returns {void}
 */
export function triggerEatEffects(foodPosition) {
    // 获取蛇头当前位置（用于能量吸收线的终点）
    const headPosition = state.snakeSegments.length > 0
        ? state.snakeSegments[0].position.clone()
        : foodPosition.clone();

    // A. 粒子爆炸
    activeEffects.push(createParticleBurst(foodPosition));

    // B. 冲击波环
    activeEffects.push(createShockwaveRings(foodPosition));

    // E. 能量吸收线（食物→蛇头）
    activeEffects.push(createEnergyBeams(foodPosition, headPosition));

    // C. 分数飘字
    const floatText = createFloatingScore(foodPosition);
    if (floatText) activeEffects.push(floatText);

    // F. 全屏闪光 + 震屏
    triggerScreenFlash();
    triggerCameraShake();

    console.log('[EFFECTS] Eat effects triggered at', foodPosition.toArray().map(v => v.toFixed(1)));
}

/**
 * 更新所有活跃特效的状态（每帧调用一次）
 * 遍历活跃特效列表，调用各特效的 update 方法推进动画，
 * 并自动检测过期特效执行 dispose 清理
 *
 * @param {number} _dt - 当前帧间隔（秒），供特效更新使用
 * @returns {void}
 */
export function updateEffects(_dt) {
    const currentTime = now();

    // 反向遍历以便安全删除过期元素
    for (let i = activeEffects.length - 1; i >= 0; i--) {
        const effect = activeEffects[i];
        const elapsed = currentTime - effect.startTime;
        const progress = Math.min(1, elapsed / effect.duration);

        // 调用特效自身的更新逻辑
        effect.update(elapsed, progress);

        // 过期则清理并移除
        if (progress >= 1) {
            effect.dispose();
            activeEffects.splice(i, 1);
        }
    }
}

/**
 * 获取当前震屏位移偏移量（供 camera.js 调用）
 * 暴力模式：高频正弦噪声 + 二次缓出衰减，强度为原版 2.2 倍
 * 震屏结束后自动清除 state.shakeState 并返回零向量
 *
 * @returns {THREE.Vector3} 当前震屏位移偏移向量（无震屏时为零向量）
 */
export function getShakeOffset() {
    if (!state.shakeState) return new THREE.Vector3(0, 0, 0);

    const elapsed = now() - state.shakeState.startTime;
    const progress = Math.min(1, elapsed / state.shakeState.duration);

    if (progress >= 1) {
        state.shakeState = null;
        return new THREE.Vector3(0, 0, 0);
    }

    // 二次缓出衰减（暴力但自然减速）
    const decay = (1 - progress) * (1 - progress);
    const intensity = state.shakeState.intensity * decay;

    // 高频多轴抖动：不同频率叠加产生不规则震动感
    const t = elapsed;
    return new THREE.Vector3(
        (Math.sin(t * 48) * Math.cos(t * 31) + Math.sin(t * 17) * 0.5) * intensity,
        (Math.cos(t * 42) * Math.sin(t * 25) + Math.cos(t * 13) * 0.5) * intensity,
        (Math.sin(t * 55) * Math.cos(t * 37) + Math.sin(t * 19) * 0.4) * intensity * 0.6
    );
}

/**
 * 获取当前震屏旋转偏移量（供 camera.js 调用）
 * Z 轴微转模拟镜头被冲击的扭转感，与位移偏移使用独立频率
 *
 * @returns {number} 当前 Z 轴旋转偏移弧度（无震屏时为 0）
 */
export function getShakeRotation() {
    if (!state.shakeState) return 0;

    const elapsed = now() - state.shakeState.startTime;
    const progress = Math.min(1, elapsed / state.shakeState.duration);

    if (progress >= 1) return 0;

    // 独立的衰减和频率，避免与位移同步导致机械感
    const decay = (1 - progress) * (1 - progress);
    const rotIntensity = state.shakeState.rotationIntensity * decay;

    // 双频叠加产生不规则的扭转抖动
    return (
        Math.sin(elapsed * 35 + 1.7) * Math.cos(elapsed * 22 + 3.1) +
        Math.sin(elapsed * 58 + 4.3) * 0.35
    ) * rotIntensity;
}

/**
 * 获取当前镜头推拉偏移量（供 camera.js 调用）
 * 相机距离先瞬间拉近（zoom in punch）再弹回原位
 * 模拟"被击退"的视觉纵深冲击，前 30% 为拉近段，之后为回弹段
 *
 * @returns {number} 当前相机半径偏移量（负值=拉近，正值=拉远/恢复）
 */
export function getShakeZoomPunch() {
    if (!state.shakeState) return 0;

    const elapsed = now() - state.shakeState.startTime;
    const progress = Math.min(1, elapsed / state.shakeState.duration);

    if (progress >= 1) return 0;

    const zoomPunch = state.shakeState.zoomPunch;

    if (progress < 0.18) {
        // 前段：快速拉近（zoom in），模拟"被击中"的视觉冲击
        const p = progress / 0.18; // 0→1
        // 弹性曲线：快速冲入+轻微过冲
        const ease = Math.sin(p * Math.PI * 0.5);
        return -zoomPunch * ease; // 负值 = 镜头拉近
    } else {
        // 后段：弹性回弹到原位
        const localP = (progress - 0.18) / 0.82; // 0→1
        // 弹性过冲后归位：先 overshoot 再收敛
        const elastic = Math.pow(2, -10 * localP) * Math.sin((localP * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
        return -zoomPunch * (1 - elastic);
    }
}

/**
 * 清理所有活跃特效（游戏重启时调用）
 * 逐一销毁所有未完成的特效对象，清空活跃列表
 * @returns {void}
 */
export function clearAllEffects() {
    activeEffects.forEach(effect => {
        try { effect.dispose(); } catch (e) { /* 忽略单次清理错误 */ }
    });
    activeEffects.length = 0;
    state.shakeState = null;
}
