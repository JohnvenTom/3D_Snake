/**
 * 障碍物系统模块（网格坐标版）
 * 负责障碍物的生成、渲染和管理，使用聚类算法确保障碍物不会过于分散
 * 所有障碍物位于整数网格格点上，与蛇/食物共享同一坐标系统
 *
 * 核心设计原则：
 *   - 使用 K-means 式聚类生成，将障碍物分成若干簇
 *   - 排除初始蛇身安全区域（曼哈顿距离 >= SAFE_DISTANCE）
 *   - 排除食物当前位置
 *   - 每个簇内障碍物相对集中，避免全地图零散分布
 *
 * @module obstacles
 */

import CONFIG from './config.js';
import state from './state.js';
import { gridToWorld } from './snake.js';

/**
 * 计算两个网格坐标点之间的曼哈顿距离
 * 曼哈顿距离 = |x1-x2| + |y1-y2| + |z1-z2|，适用于网格移动的场景
 * @param {Object} pos1 - 第一个网格坐标 {x, y, z}
 * @param {Object} pos2 - 第二个网格坐标 {x, y, z}
 * @returns {number} 曼哈顿距离（格数）
 */
function manhattanDistance(pos1, pos2) {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y) + Math.abs(pos1.z - pos2.z);
}

/**
 * 检查某个网格位置是否在初始蛇身的安全区域之外
 * 安全区域定义为：距离任何一节初始蛇身的曼哈顿距离 >= SAFE_DISTANCE
 * 这确保了蛇在游戏开始时有足够的活动空间，不会立即被障碍物包围
 * @param {Object} gridPos - 待检测的网格坐标 {x, y, z}
 * @param {Array} initialSnakePositions - 初始蛇身的网格坐标数组
 * @param {number} safeDistance - 最小安全距离（格数）
 * @returns {boolean} 是否在安全区域外（true=安全，可放置障碍物）
 */
function isSafeFromSnake(gridPos, initialSnakePositions, safeDistance) {
    for (const snakePos of initialSnakePositions) {
        if (manhattanDistance(gridPos, snakePos) < safeDistance) {
            return false;
        }
    }
    return true;
}

/**
 * 生成聚类中心点
 * 在场景边界内随机生成 N 个聚类中心，确保：
 *   - 远离初始蛇身位置
 *   - 聚类中心之间保持一定距离（避免重叠）
 *   - 不超出场景边界
 * @param {Array} initialSnakePositions - 初始蛇身位置数组（用于计算安全区域）
 * @param {number} clusterCount - 需要生成的聚类数量
 * @returns {Array} 聚类中心坐标数组，每个元素为 {x, y, z}
 */
function generateClusterCenters(initialSnakePositions, clusterCount) {
    const centers = [];
    const bound = CONFIG.ARENA_SIZE;
    const minCenterDistance = CONFIG.OBSTACLE_MIN_CENTER_DISTANCE || 8; // 聚类中心之间的最小距离

    let attempts = 0;
    const maxAttempts = 1000;

    while (centers.length < clusterCount && attempts < maxAttempts) {
        attempts++;

        // 随机生成候选中心点（整数网格坐标）
        const candidate = {
            x: Math.floor(Math.random() * (bound * 2 + 1)) - bound,
            y: Math.floor(Math.random() * (bound * 2 + 1)) - bound,
            z: Math.floor(Math.random() * (bound * 2 + 1)) - bound
        };

        // 检查是否远离初始蛇身
        if (!isSafeFromSnake(candidate, initialSnakePositions, CONFIG.OBSTACLE_SAFE_DISTANCE_FROM_SNAKE)) {
            continue;
        }

        // 检查是否与其他已生成的中心点保持足够距离
        let tooClose = false;
        for (const center of centers) {
            if (manhattanDistance(candidate, center) < minCenterDistance) {
                tooClose = true;
                break;
            }
        }

        if (!tooClose) {
            centers.push(candidate);
        }
    }

    return centers;
}

/**
 * 预定义的结构化障碍物形状模板库
 * 每个形状是一组相对于中心点的 {x, y, z} 偏移量数组
 * 设计原则：有明确的几何轮廓和聚集感，但不是死板的长方体
 *
 * 形状说明：
 *   - cross:    十字形（XZ平面十字 + Y轴柱体）
 *   - lshape:   L形拐角（带厚度）
 *   - tshape:   T形（横臂+竖干）
 *   - zigzag:   Z形折线（3段折角）
 *   - corner:   角落围栏（U形开口）
 *   - plus:     加号/星形（四向延伸）
 *   - staircase: 阶梯形状（逐级上升）
 *   - diagonal: 对角线团块（斜向排列）
 */
const SHAPE_TEMPLATES = [
    // === 1. 十字形（中心向四方向延伸） ===
    {
        name: 'cross',
        offsets: [
            // 中心柱（Y轴）
            { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
            // X轴臂
            { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: -2, y: 0, z: 0 },
            // Z轴臂
            { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -2 },
            // 臂端加厚
            { x: 2, y: 1, z: 0 }, { x: -2, y: 1, z: 0 }, { x: 0, y: 1, z: 2 }, { x: 0, y: 1, z: -2 }
        ]
    },
    // === 2. L形拐角 ===
    {
        name: 'lshape',
        offsets: [
            // 横臂
            { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 3, y: 1, z: 0 },
            // 竖臂（从拐角处向下延伸）
            { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 3 },
            { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: 2 }, { x: 0, y: 1, z: 3 }
        ]
    },
    // === 3. T形 ===
    {
        name: 'tshape',
        offsets: [
            // 顶部横梁
            { x: -2, y: 1, z: 0 }, { x: -1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
            { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 },
            { x: -2, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
            // 竖直主干
            { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: 4 },
            { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: 2 }, { x: 0, y: 1, z: 3 }, { x: 0, y: 1, z: 4 }
        ]
    },
    // === 4. Z形/S形折线 ===
    {
        name: 'zigzag',
        offsets: [
            // 第一段（沿+X）
            { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 },
            // 第二段（对角过渡到+Z）
            { x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 1 }, { x: 3, y: 0, z: 2 },
            { x: 3, y: 1, z: 0 }, { x: 3, y: 1, z: 1 }, { x: 3, y: 1, z: 2 },
            // 第三段（沿-X方向）
            { x: 2, y: 0, z: 3 }, { x: 1, y: 0, z: 3 }, { x: 0, y: 0, z: 3 },
            { x: 2, y: 1, z: 3 }, { x: 1, y: 1, z: 3 }, { x: 0, y: 1, z: 3 }
        ]
    },
    // === 5. U形角落围栏 ===
    {
        name: 'corner',
        offsets: [
            // 左墙
            { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 3 },
            { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: 2 }, { x: 0, y: 1, z: 3 },
            // 后墙
            { x: 1, y: 0, z: 3 }, { x: 2, y: 0, z: 3 }, { x: 3, y: 0, z: 3 },
            { x: 1, y: 1, z: 3 }, { x: 2, y: 1, z: 3 }, { x: 3, y: 1, z: 3 },
            // 右墙（较短，形成开口）
            { x: 3, y: 0, z: 2 }, { x: 3, y: 0, z: 1 },
            { x: 3, y: 1, z: 2 }, { x: 3, y: 1, z: 1 }
        ]
    },
    // === 6. 加号/星形（三维延伸） ===
    {
        name: 'plus',
        offsets: [
            // 核心块（2×2×2）
            { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 },
            { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 1, z: 1 }, { x: 1, y: 1, z: 1 },
            // 六向延伸臂
            { x: 2, y: 0, z: 0 }, { x: 2, y: 1, z: 0 },
            { x: -1, y: 0, z: 0 }, { x: -1, y: 1, z: 0 },
            { x: 0, y: 0, z: 2 }, { x: 1, y: 0, z: 2 },
            { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: -1 },
            { x: 0, y: 2, z: 0 }, { x: 1, y: 2, z: 0 },
            { x: 0, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }
        ]
    },
    // === 7. 阶梯形状 ===
    {
        name: 'staircase',
        offsets: [
            // 第一阶
            { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 },
            // 第二阶（抬高Y并前移Z）
            { x: 2, y: 1, z: 0 }, { x: 2, y: 1, z: 1 },
            { x: 2, y: 2, z: 0 }, { x: 2, y: 2, z: 1 },
            // 第三阶
            { x: 3, y: 2, z: 1 }, { x: 3, y: 2, z: 2 },
            { x: 3, y: 3, z: 1 }, { x: 3, y: 3, z: 2 },
            // 第四阶
            { x: 4, y: 3, z: 2 }, { x: 4, y: 3, z: 3 },
            { x: 4, y: 4, z: 2 }, { x: 4, y: 4, z: 3 }
        ]
    },
    // === 8. 斜向团块（菱形分布） ===
    {
        name: 'diagonal',
        offsets: [
            // 中心核
            { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 },
            { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 1, z: 1 }, { x: 1, y: 1, z: 1 },
            // 四个对角方向的"触角"
            { x: 2, y: 0, z: 2 }, { x: 2, y: 1, z: 2 },
            { x: -1, y: 0, z: -1 }, { x: -1, y: 1, z: -1 },
            { x: 2, y: 0, z: -1 }, { x: 2, y: 1, z: -1 },
            { x: -1, y: 0, z: 2 }, { x: -1, y: 1, z: 2 },
            // 触角尖端加粗
            { x: 3, y: 0, z: 3 }, { x: 3, y: 1, z: 3 },
            { x: -2, y: 0, z: -2 }, { x: -2, y: 1, z: -2 }
        ]
    }
];

/**
 * 使用预设形状模板在指定中心位置生成障碍物
 * 从 SHAPE_TEMPLATES 中随机选取一个形状，将偏移量叠加到中心坐标上
 * 每个坐标点都经过边界检查和占用检查，确保不越界、不重叠
 *
 * @param {Object} center - 形状的网格坐标中心 {x, y, z}
 * @param {Set} occupied - 已占用格子集合（用于避免重复）
 * @returns {Array} 生成的障碍物网格坐标数组
 */
function generateShapeObstacles(center, occupied) {
    const obstacles = [];
    const bound = CONFIG.ARENA_SIZE;

    // 从模板库中随机选择一个形状
    const template = SHAPE_TEMPLATES[Math.floor(Math.random() * SHAPE_TEMPLATES.length)];

    // 遍历形状的所有偏移点
    for (const offset of template.offsets) {
        const pos = {
            x: center.x + offset.x,
            y: center.y + offset.y,
            z: center.z + offset.z
        };

        // 边界检查
        if (Math.abs(pos.x) > bound || Math.abs(pos.y) > bound || Math.abs(pos.z) > bound) {
            continue;
        }

        // 占用检查
        const key = `${pos.x},${pos.y},${pos.z}`;
        if (occupied.has(key)) {
            continue;
        }

        occupied.add(key);
        obstacles.push(pos);
    }

    console.log(`[OBSTACLES] 使用形状模板: ${template.name}, 生成 ${obstacles.length} 个障碍物`);
    return obstacles;
}

/**
 * 创建单个障碍物 Mesh
 * 使用暗红色立方体材质，带自发光和金属质感，视觉上形成"危险区域"的警示效果
 * 尺寸略大于网格单元，确保视觉上的存在感
 * @param {THREE.Vector3} position - 障碍物的世界坐标位置
 * @returns {THREE.Mesh} 障碍物 Mesh 对象（已设置 name='obstacle'）
 */
function createObstacleMesh(position) {
    const geometry = new THREE.BoxGeometry(
        CONFIG.OBSTACLE_SIZE,
        CONFIG.OBSTACLE_SIZE,
        CONFIG.OBSTACLE_SIZE
    );

    const material = new THREE.MeshStandardMaterial({
        color: CONFIG.COLOR_OBSTACLE,
        emissive: CONFIG.COLOR_OBSTACLE,
        emissiveIntensity: 0.25,
        roughness: 0.4,
        metalness: 0.6,
        transparent: true,
        opacity: 0.88
    });

    const obstacle = new THREE.Mesh(geometry, material);
    obstacle.position.copy(position);
    obstacle.castShadow = true;
    obstacle.receiveShadow = true;
    obstacle.name = 'obstacle';

    return obstacle;
}

/**
 * 初始化障碍物系统
 * 游戏开始时调用，执行完整的障碍物生成流程：
 *   1. 清理旧的障碍物（如果有）
 *   2. 使用规则形状算法生成障碍物（长方体块，确保规整不分散）
 *   3. 为每个障碍物创建 3D Mesh 并添加到场景
 *   4. 更新全局状态（obstacleGridPositions / obstacleMeshes）
 *
 * 生成策略：
 *   - 将 OBSTACLE_COUNT 个障碍物分配到 OBSTACLE_CLUSTER_COUNT 个规则形状块中
 *   - 每个形状块是一个实心长方体（尺寸由 OBSTACLE_SHAPE_SIZE 定义）
 *   - 形状块中心远离初始蛇身（>= SAFE_DISTANCE 格）
 *   - 形状块之间保持足够距离（避免合并成一大块）
 *   - 自动排除食物位置和蛇身占用的格子
 *
 * @returns {void}
 */
export function initObstacles() {
    // === 1. 清理旧障碍物 ===
    clearObstacles();

    // === 2. 构建已占用格子集合 ===
    const occupied = new Set();

    // 添加初始蛇身位置到占用集
    state.snakeGridPositions.forEach(gp => {
        occupied.add(`${gp.x},${gp.y},${gp.z}`);
    });

    // 添加食物位置到占用集（如果食物已生成）
    if (state.foodGridPos) {
        occupied.add(`${state.foodGridPos.x},${state.foodGridPos.y},${state.foodGridPos.z}`);
    }

    // === 3. 生成形状块中心点 ===
    const shapeCenters = generateClusterCenters(
        state.snakeGridPositions,
        CONFIG.OBSTACLE_CLUSTER_COUNT
    );

    if (shapeCenters.length === 0) {
        console.warn('[OBSTACLES] 无法生成形状块中心，跳过障碍物生成');
        return;
    }

    // === 4. 在每个中心点使用随机形状模板生成障碍物 ===
    const allObstacles = [];

    shapeCenters.forEach((center) => {
        const shapeObstacles = generateShapeObstacles(center, occupied);
        allObstacles.push(...shapeObstacles);
    });

    // === 5. 创建 3D Mesh 并添加到场景 ===
    allObstacles.forEach(gridPos => {
        const worldPos = gridToWorld(gridPos);
        const mesh = createObstacleMesh(worldPos);

        state.obstacleMeshes.push(mesh);
        state.obstacleGridPositions.push(gridPos);
        state.scene.add(mesh);
    });

    console.log(`[OBSTACLES] 成功生成 ${allObstacles.length} 个障碍物，分为 ${shapeCenters.length} 个形状块`);
}

/**
 * 清理所有障碍物
 * 从场景中移除所有障碍物 Mesh，并清空状态数组
 * 在游戏重新开始时调用，确保旧障碍物被完全清除
 * @returns {void}
 */
export function clearObstacles() {
    // 从场景中移除所有障碍物 Mesh（仅在 scene 存在时执行）
    state.obstacleMeshes.forEach(mesh => {
        if (state.scene) {
            state.scene.remove(mesh);
        }
        // 释放几何体和材质资源
        mesh.geometry.dispose();
        mesh.material.dispose();
    });

    // 清空状态数组
    state.obstacleMeshes = [];
    state.obstacleGridPositions = [];
}

/**
 * 检查指定网格位置是否与任何障碍物重叠
 * 用于碰撞检测和食物/障碍物生成时的位置验证
 * @param {Object} gridPos - 待检测的网格坐标 {x, y, z}
 * @returns {boolean} 是否与障碍物重叠（true=有障碍物在该位置）
 */
export function isPositionOccupiedByObstacle(gridPos) {
    return state.obstacleGridPositions.some(obs =>
        obs.x === gridPos.x && obs.y === gridPos.y && obs.z === gridPos.z
    );
}

/**
 * 将障碍物位置添加到已占用格子集合
 * 辅助函数，供 food.js 的 spawnFood 使用，确保食物不会生成在障碍物位置
 * @param {Set} occupiedSet - 已占用格子的 Set 集合（会被修改）
 * @returns {void}
 */
export function markObstaclePositions(occupiedSet) {
    state.obstacleGridPositions.forEach(gp => {
        occupiedSet.add(`${gp.x},${gp.y},${gp.z}`);
    });
}
