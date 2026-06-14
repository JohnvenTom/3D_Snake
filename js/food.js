/**
 * 食物系统模块（网格坐标版）
 * 食物只出现在整数网格格点上，生成时排除所有已被蛇身占用的格子
 * 从根本上消除"食物在危险位置导致误判 Game Over"的问题
 * @module food
 */

import CONFIG from './config.js';
import state from './state.js';
import { gridToWorld } from './snake.js';
import { easeOutCubic, easeInCubic } from './utils.js';
import { markObstaclePositions } from './obstacles.js';

/**
 * 创建食物 Mesh
 * 使用珊瑚橙色球体模型，带自发光效果，与蛇体形成强视觉对比
 * @returns {THREE.Mesh} 食物 Mesh 对象（已设置 name='food'）
 */
export function createFood() {
    const geometry = new THREE.SphereGeometry(0.4, 24, 24);
    const material = new THREE.MeshStandardMaterial({
        color: CONFIG.COLOR_FOOD,
        emissive: CONFIG.COLOR_FOOD,
        emissiveIntensity: 0.55,
        roughness: 0.12,
        metalness: 0.75
    });
    const food = new THREE.Mesh(geometry, material);
    food.castShadow = true;
    food.name = 'food';
    return food;
}

/**
 * 创建穿过食物位置的 XYZ 三轴辅助线组
 * 每条轴用不同颜色区分（X=珊瑚橙 Y=荧光绿 Z=电蓝），
 * 线段从食物中心向两端延伸至场景边界，端点带小球标记
 * @param {THREE.Vector3} position - 辅助线中心位置（即食物的世界坐标位置）
 * @returns {THREE.Group} 包含三条轴线（正负方向各一条Line）+ 端点标记球 + 中心十字的 Group 对象
 */
export function createFoodAxes(position) {
    const group = new THREE.Group();
    group.name = 'foodAxes';

    const bound = CONFIG.ARENA_SIZE;
    // 各轴颜色配置：X=珊瑚橙 Y=荧光绿 Z=电蓝
    const axisColors = [
        { dir: new THREE.Vector3(1, 0, 0), color: 0xff5733 },   // X - 珊瑚橙
        { dir: new THREE.Vector3(0, 1, 0), color: 0xc8ff00 },   // Y - 荧光绿
        { dir: new THREE.Vector3(0, 0, 1), color: 0x4d7cff }    // Z - 电蓝
    ];

    axisColors.forEach((axis, index) => {
        // 计算该轴从中心到边界的距离（正负方向分别计算）
        const positiveDist = bound - Math.abs(position.getComponent(index));
        const negativeDist = bound + Math.abs(position.getComponent(index));

        // 正方向线段几何体（从中心到正边界）
        const posGeo = new THREE.BufferGeometry();
        const posPositions = new Float32Array([
            0, 0, 0,
            axis.dir.x * positiveDist, axis.dir.y * positiveDist, axis.dir.z * positiveDist
        ]);
        posGeo.setAttribute('position', new THREE.BufferAttribute(posPositions, 3));

        // 负方向线段几何体（从中心到负边界）
        const negGeo = new THREE.BufferGeometry();
        const negPositions = new Float32Array([
            0, 0, 0,
            -axis.dir.x * negativeDist, -axis.dir.y * negativeDist, -axis.dir.z * negativeDist
        ]);
        negGeo.setAttribute('position', new THREE.BufferAttribute(negPositions, 3));

        // 材质：半透明 + 发光效果
        const mat = new THREE.LineBasicMaterial({
            color: axis.color,
            transparent: true,
            opacity: 0.55,
            linewidth: 1
        });

        group.add(new THREE.Line(posGeo, mat));
        group.add(new THREE.Line(negGeo, mat.clone()));

        // 在轴端点添加小标记球（帮助识别方向）
        const dotGeo = new THREE.SphereGeometry(0.1, 8, 8);
        const dotMat = new THREE.MeshBasicMaterial({
            color: axis.color,
            transparent: true,
            opacity: 0.6
        });

        // 正端点标记球
        const posDot = new THREE.Mesh(dotGeo, dotMat.clone());
        posDot.position.set(
            axis.dir.x * positiveDist,
            axis.dir.y * positiveDist,
            axis.dir.z * positiveDist
        );
        group.add(posDot);

        // 负端点标记球
        const negDot = new THREE.Mesh(dotGeo, dotMat.clone());
        negDot.position.set(
            -axis.dir.x * negativeDist,
            -axis.dir.y * negativeDist,
            -axis.dir.z * negativeDist
        );
        group.add(negDot);
    });

    // 中心十字标记（四条短线组成的小十字）
    const crossSize = 0.6;
    const crossMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35
    });
    for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i;
        const crossGeo = new THREE.BufferGeometry();
        const crossPos = new Float32Array([
            Math.cos(angle) * crossSize * 0.5, Math.sin(angle) * crossSize * 0.5, 0,
            -Math.cos(angle) * crossSize * 0.5, -Math.sin(angle) * crossSize * 0.5, 0
        ]);
        crossGeo.setAttribute('position', new THREE.BufferAttribute(crossPos, 3));
        group.add(new THREE.Line(crossGeo, crossMat));
    }

    group.position.copy(position);
    return group;
}

/**
 * 更新辅助线动画进度（每帧调用）
 * 通过修改每条 Line 的顶点位置实现"从中心向外生长"的动画效果，
 * 同步处理端点球的缩放和透明度变化
 * @param {number} progress - 当前动画进度 0~1（0=完全消失, 1=完全显示）
 * @returns {void}
 */
export function updateAxesAnimation(progress) {
    if (!state.foodAxesGroup || !state.foodMesh) return;

    // 将辅助线组位置同步到食物当前位置
    state.foodAxesGroup.position.copy(state.foodMesh.position);

    // 遍历所有子对象，按类型分别执行动画
    state.foodAxesGroup.children.forEach((child) => {
        if (child instanceof THREE.Line) {
            // 线段：按进度缩放末端顶点坐标（带缓动）
            const positions = child.geometry.attributes.position.array;
            const fullX = positions[3];
            const fullY = positions[4];
            const fullZ = positions[5];
            const easedProgress = easeOutCubic(progress);
            positions[3] = fullX * easedProgress;
            positions[4] = fullY * easedProgress;
            positions[5] = fullZ * easedProgress;
            child.geometry.attributes.position.needsUpdate = true;

            // 同步透明度渐变
            if (child.material) {
                child.material.opacity = 0.55 * easedProgress;
            }
        } else if (child instanceof THREE.Mesh && child.geometry.type === 'SphereGeometry') {
            // 端点小球：缩放 + 透明度动画
            const scale = easeOutCubic(progress);
            child.scale.setScalar(scale);
            if (child.material) {
                child.material.opacity = 0.6 * scale;
            }
        }
    });
}

/**
 * 在有效三维网格空间内随机放置食物（网格坐标版）
 *
 * 核心改进：
 *   - 食物只出现在整数网格格点上（非随机浮点坐标）
 *   - 通过 Set 数据结构快速排除所有被蛇身占用的格子
 *   - 生成的食物位置天然安全，不存在"靠近边界/蛇身"的歧义问题
 *
 * 流程：
 *   1. 构建当前场上所有已占用格子的集合（蛇身各节 + 边界外区域）
 *   2. 在可用格子中随机选取一个作为食物位置
 *   3. 创建食物 Mesh 和辅助线，触发出现动画
 *
 * @returns {void}
 */
export function spawnFood() {
    // 移除旧食物和旧辅助线
    if (state.foodMesh) {
        state.scene.remove(state.foodMesh);
    }
    if (state.foodAxesGroup) {
        state.scene.remove(state.foodAxesGroup);
        state.foodAxesGroup = null;
    }

    // 构建已占用格子集合（用于排除）
    const occupied = new Set();
    state.snakeGridPositions.forEach(gp => {
        occupied.add(`${gp.x},${gp.y},${gp.z}`);
    });

    // 添加障碍物位置到占用集（确保食物不会生成在障碍物上）
    markObstaclePositions(occupied);

    // 收集所有可用的空余格子（边界范围内的整数坐标）
    const available = [];
    const bound = CONFIG.ARENA_SIZE;
    for (let x = -bound; x <= bound; x++) {
        for (let y = -bound; y <= bound; y++) {
            for (let z = -bound; z <= bound; z++) {
                const key = `${x},${y},${z}`;
                if (!occupied.has(key)) {
                    available.push({ x, y, z });
                }
            }
        }
    }

    // 随机选取一个空余格子作为食物位置
    if (available.length > 0) {
        const randomIndex = Math.floor(Math.random() * available.length);
        state.foodGridPos = available[randomIndex];
    } else {
        // 理论上不应发生：蛇填满了整个空间（胜利条件？）
        state.foodGridPos = { x: 0, y: 0, z: 0 };
    }

    // 创建食物 Mesh 并放置到对应世界坐标
    state.foodMesh = createFood();
    state.foodMesh.position.copy(gridToWorld(state.foodGridPos));
    state.scene.add(state.foodMesh);

    // 创建辅助线并触发出现动画
    state.foodAxesGroup = createFoodAxes(state.foodMesh.position);
    state.scene.add(state.foodAxesGroup);
    state.axesAnimProgress = 0;
    state.axesAnimState = 'in';
}

/** 导出缓动函数供 game.js 模块复用（食物消失收缩动画） */
export { easeInCubic };
