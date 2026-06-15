/**
 * 蛇体系统模块（网格坐标版）
 * 核心设计：逻辑层使用整数网格坐标，渲染层通过插值实现平滑视觉效果
 * 两者分离确保碰撞判定精确无误，同时保持流畅的视觉体验
 * @module snake
 */

import CONFIG from './config.js';
import state from './state.js';
import { isOppositeDirection } from './utils.js';

/**
 * 创建蛇头 Mesh
 * 使用荧光绿发光立方体材质，视觉上与身体形成醒目区分
 * @param {THREE.Vector3} position - 蛇头的初始渲染位置（世界坐标）
 * @returns {THREE.Mesh} 蛇头 Mesh 对象（已设置 name='snakeHead'）
 */
export function createSnakeHead(position) {
    const geometry = new THREE.BoxGeometry(
        CONFIG.SEGMENT_SIZE,
        CONFIG.SEGMENT_SIZE,
        CONFIG.SEGMENT_SIZE
    );
    const material = new THREE.MeshStandardMaterial({
        color: CONFIG.COLOR_SNAKE_HEAD,
        emissive: CONFIG.COLOR_SNAKE_HEAD,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        metalness: 0.55
    });
    const head = new THREE.Mesh(geometry, material);
    head.position.copy(position);
    head.castShadow = true;
    head.name = 'snakeHead';
    return head;
}

/**
 * 创建蛇身单节 Mesh
 * 使用渐变深绿色立方体材质，颜色沿蛇身从头到尾逐渐变暗
 * @param {THREE.Vector3} position - 该身体节的初始渲染位置（世界坐标）
 * @returns {THREE.Mesh} 蛇身节 Mesh 对象
 */
export function createSnakeSegment(position) {
    const geometry = new THREE.BoxGeometry(
        CONFIG.SEGMENT_SIZE * 0.95,
        CONFIG.SEGMENT_SIZE * 0.95,
        CONFIG.SEGMENT_SIZE * 0.95
    );

    // 身体颜色沿蛇身渐变：从头到尾逐渐变暗（饱和度和亮度递减）
    const progress = state.snakeSegments.length / 50;
    const baseHue = 0.21;
    const saturation = Math.max(0.5, 0.72 - progress * 0.2);
    const lightness = Math.max(0.2, 0.38 - progress * 0.12);

    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(baseHue, saturation, lightness),
        emissive: new THREE.Color().setHSL(baseHue, saturation * 0.6, lightness * 0.3),
        emissiveIntensity: 0.18,
        roughness: 0.38,
        metalness: 0.35
    });
    const segment = new THREE.Mesh(geometry, material);
    segment.position.copy(position);
    segment.castShadow = true;
    return segment;
}

/**
 * 初始化蛇体（网格坐标系统）
 * 在原点附近沿 X 轴正方向生成初始蛇身，每节占据一个整数网格格点
 * 同时初始化逻辑坐标数组 snakeGridPositions 和渲染 Mesh 数组 snakeSegments
 * @returns {void}
 */
export function initSnake() {
    // 清除旧蛇身
    state.snakeSegments.forEach(seg => state.scene.remove(seg));
    state.snakeSegments = [];
    state.snakeGridPositions = [];
    // 清空方向缓冲队列（防止残留的预输入影响新游戏）
    state.directionBuffer = [];

    // 生成初始蛇身（沿 X 轴排列，每节间隔一格）
    for (let i = 0; i < CONFIG.INITIAL_LENGTH; i++) {
        // 网格坐标：整数格点
        const gridPos = { x: -i, y: 0, z: 0 };
        state.snakeGridPositions.push(gridPos);

        // 渲染位置：将网格坐标转换为世界坐标
        const worldPos = gridToWorld(gridPos);

        if (i === 0) {
            const head = createSnakeHead(worldPos);
            state.snakeSegments.push(head);
            state.scene.add(head);
        } else {
            const segment = createSnakeSegment(worldPos);
            state.snakeSegments.push(segment);
            state.scene.add(segment);
        }
    }

    // 重置方向向量和移动计时器
    state.currentDirection = new THREE.Vector3(1, 0, 0);
    state.nextDirection = new THREE.Vector3(1, 0, 0);
    state.moveTimer = 0;
    state.moveInterval = CONFIG.BASE_MOVE_INTERVAL;
    state.stepCount = 0;
}

/**
 * 将网格坐标转换为世界坐标（浮点数 Vector3）
 * 网格坐标的每个整数值乘以 GRID_UNIT 即为对应的世界坐标
 * @param {Object} gridPos - 网格坐标对象 {x: number, y: number, z: number}
 * @returns {THREE.Vector3} 对应的世界坐标向量
 */
export function gridToWorld(gridPos) {
    return new THREE.Vector3(
        gridPos.x * CONFIG.GRID_UNIT,
        gridPos.y * CONFIG.GRID_UNIT,
        gridPos.z * CONFIG.GRID_UNIT
    );
}

/**
 * 更新蛇身位置（每帧调用，包含步进逻辑和渲染插值两部分）
 *
 * 步进逻辑：
 *   - 使用真实 deltaTime 累积 moveTimer，达到 moveInterval 时触发一步移动
 *   - 头部向当前方向前进一格（整数坐标），身体各节依次前移
 *   - 移动后重置计时器（保留余量避免时间漂移）
 *
 * 渲染插值（帧率无关）：
 *   - 每帧将各节 Mesh 的渲染位置平滑地 lerp 向目标网格坐标
 *   - lerp 系数根据 deltaTime 动态计算，确保不同刷新率下视觉速度一致
 *   - 即使没有发生步进也在执行，保证视觉连续性
 *
 * @param {number} dt - 当前帧的真实时间间隔（秒），由 gameLoop 通过 performance.now() 计算
 * @returns {boolean} 是否在本帧发生了步进移动（用于碰撞检测时序控制）
 */
export function updateSnake(dt) {
    let stepped = false;

    // === 步进移动部分（使用真实 deltaTime） ===
    state.moveTimer += dt;

    if (state.moveTimer >= state.moveInterval) {
        // 计时器到达阈值 → 触发一步移动
        state.moveTimer -= state.moveInterval; // 保留余量避免时间漂移
        stepped = true;
        state.stepCount++;

        // 从方向缓冲队列中取出下一个方向（支持连续按键预输入）
        if (state.directionBuffer.length > 0) {
            const bufferedDir = state.directionBuffer.shift();
            // 二次反向检查：防止缓冲的方向在延迟后变成非法（如蛇已移动到新位置）
            if (!isOppositeDirection(bufferedDir, state.currentDirection)) {
                state.currentDirection.copy(bufferedDir);
            }
            // 更新 nextDirection 为新的队首（或保持当前方向）
            state.nextDirection.copy(
                state.directionBuffer.length > 0
                    ? state.directionBuffer[0]
                    : state.currentDirection
            );
        } else {
            // 队列为空时使用 nextDirection（兼容旧逻辑）
            state.currentDirection.copy(state.nextDirection);
        }

        // 保存头部当前网格坐标（增长时尾部需要停留在该位置）
        const oldHeadGrid = { ...state.snakeGridPositions[0] };

        // 头部向当前方向前进一格
        const headGrid = state.snakeGridPositions[0];
        headGrid.x += Math.round(state.currentDirection.x);
        headGrid.y += Math.round(state.currentDirection.y);
        headGrid.z += Math.round(state.currentDirection.z);

        // 身体各节依次前移：每节取前一节的旧坐标（从尾到头处理避免覆盖）
        for (let i = state.snakeGridPositions.length - 1; i > 0; i--) {
            state.snakeGridPositions[i].x = state.snakeGridPositions[i - 1].x;
            state.snakeGridPositions[i].y = state.snakeGridPositions[i - 1].y;
            state.snakeGridPositions[i].z = state.snakeGridPositions[i - 1].z;
        }

        // 记录尾部旧坐标（供 growSnake 使用：增长时新节追加在此位置）
        state._lastTailGridPos = {
            x: state.snakeGridPositions[state.snakeGridPositions.length - 1].x,
            y: state.snakeGridPositions[state.snakeGridPositions.length - 1].y,
            z: state.snakeGridPositions[state.snakeGridPositions.length - 1].z
        };
    }

    // === 渲染插值部分（帧率无关的动态 lerp） ===
    // 基于公式：1 - (1 - baseFactor) ^ (dt * 60)，在60fps下等效于 baseFactor，
    // 高刷新率时自动增大系数保持视觉速度一致，低刷新率时减小避免跳变
    const dynamicLerp = 1 - Math.pow(1 - CONFIG.RENDER_LERP_FACTOR, dt * 60);
    for (let i = 0; i < state.snakeSegments.length; i++) {
        const targetWorldPos = gridToWorld(state.snakeGridPositions[i]);
        state.snakeSegments[i].position.lerp(targetWorldPos, dynamicLerp);
    }

    return stepped;
}

/**
 * 蛇身增长一节
 * 在尾部追加新的身体段（使用上次步进时保存的尾部旧网格坐标）
 * 新增段同时创建对应的 Mesh 并添加到场景中
 * 必须在 updateSnake() 的步进逻辑之后调用（依赖 _lastTailGridPos）
 * @returns {void}
 */
export function growSnake() {
    // 使用保存的尾部旧坐标作为新节的位置
    const tailGridPos = state._lastTailGridPos || { ...state.snakeGridPositions[state.snakeGridPositions.length - 1] };

    // 追加到网格坐标数组
    state.snakeGridPositions.push({ ...tailGridPos });

    // 创建对应 Mesh 并加入场景
    const worldPos = gridToWorld(tailGridPos);
    const newSegment = createSnakeSegment(worldPos);
    state.snakeSegments.push(newSegment);
    state.scene.add(newSegment);
}
