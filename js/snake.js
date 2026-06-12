/**
 * 蛇体系统模块（网格坐标版）
 * 核心设计：逻辑层使用整数网格坐标，渲染层通过插值实现平滑视觉效果
 * 两者分离确保碰撞判定精确无误，同时保持流畅的视觉体验
 * @module snake
 */

import CONFIG from './config.js';
import state from './state.js';

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
 *   - 累积 moveTimer，当达到 moveInterval 时触发一步移动
 *   - 头部向当前方向前进一格（整数坐标），身体各节依次前移
 *   - 移动后重置计时器
 *
 * 渲染插值：
 *   - 每帧将各节 Mesh 的渲染位置平滑地 lerp 向目标网格坐标
 *   - 即使没有发生步进也在执行，保证视觉连续性
 *
 * @returns {boolean} 是否在本帧发生了步进移动（用于碰撞检测时序控制）
 */
export function updateSnake() {
    let stepped = false;

    // === 步进移动部分 ===
    state.moveTimer += 1 / 60; // 假设约60fps，每帧累积约16.7ms

    if (state.moveTimer >= state.moveInterval) {
        // 计时器到达阈值 → 触发一步移动
        state.moveTimer -= state.moveInterval; // 保留余量避免时间漂移
        stepped = true;
        state.stepCount++;

        // 将缓冲方向确认为当前方向
        state.currentDirection.copy(state.nextDirection);

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

    // === 渲染插值部分（每帧都执行） ===
    // 将每个 Mesh 的渲染位置平滑地 lerp 向其目标网格坐标
    for (let i = 0; i < state.snakeSegments.length; i++) {
        const targetWorldPos = gridToWorld(state.snakeGridPositions[i]);
        state.snakeSegments[i].position.lerp(targetWorldPos, CONFIG.RENDER_LERP_FACTOR);
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
