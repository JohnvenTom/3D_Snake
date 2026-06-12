/**
 * 游戏主流程控制模块（网格坐标版）
 * 负责游戏生命周期管理：开始、主循环（每帧更新）、结束、重新启动
 * 是整个游戏的调度中心，协调调用各子模块完成每帧逻辑
 *
 * 网格坐标系统下的关键设计：
 *   - 碰撞检测仅在发生步进移动时执行（stepped=true），避免帧间状态不一致
 *   - 不再需要无敌帧等补丁机制，因为食物/蛇身都在安全格点上
 *   - 速度控制通过调整 moveInterval 实现（间隔越小越快）
 *
 * @module game
 */

import CONFIG from './config.js';
import state from './state.js';
import { initScene, onWindowResize } from './scene.js';
import { initSnake, updateSnake, growSnake } from './snake.js';
import { spawnFood, updateAxesAnimation, easeInCubic } from './food.js';
import { checkFoodCollision, checkBoundaryCollision, checkSelfCollision } from './collision.js';
import { setupControls, updateModeIndicator } from './controls.js';
import { updateCamera, setupCameraControls } from './camera.js';
import { updateUI } from './ui.js';

/**
 * 开始游戏
 * 重置所有状态，初始化 Three.js 场景/蛇体/食物，绑定控制与相机事件，启动渲染循环
 * @returns {void}
 */
export function startGame() {
    // 隐藏开始界面
    state.dom.startOverlay.classList.add('hidden');

    // 重置游戏运行状态
    state.score = 0;
    state.isGameRunning = true;

    // 初始化游戏对象（场景 → 蛇体 → 食物）
    initScene();
    initSnake();
    spawnFood();

    // 绑定交互控制
    setupControls();
    setupCameraControls();

    // 刷新 UI 面板数据
    updateUI();

    // 启动游戏循环（先取消可能存在的旧循环，并重置帧时间戳）
    if (state.animationId) cancelAnimationFrame(state.animationId);
    lastFrameTime = 0;
    gameLoop();
}

/** 上一帧时间戳（用于计算真实帧间隔 deltaTime） */
let lastFrameTime = 0;

/**
 * 主游戏循环（requestAnimationFrame 驱动，每帧执行一次）
 * 使用 performance.now() 时间戳计算真实 deltaTime，确保步进和插值在任意刷新率下一致
 *
 * 执行顺序：
 *   1. 更新蛇身位置（步进 + 渲染插值）→ 返回是否发生步进
 *   2. 辅助线动画状态机（出现/消失/idle 三态切换）
 *   3. 碰撞检测（仅在步进帧执行：食物 → 边界 → 自身）
 *   4. 食物自旋动画
 *   5. 相机轨道更新
 *   6. 渲染场景
 *
 * @param {number} timestamp - requestAnimationFrame 回调传入的高精度时间戳（毫秒）
 * @returns {void}
 */
function gameLoop(timestamp) {
    if (!state.isGameRunning) return;

    state.animationId = requestAnimationFrame(gameLoop);

    // 计算真实帧间隔（秒），首帧初始化并跳过
    const deltaTime = lastFrameTime ? (timestamp - lastFrameTime) / 1000 : 1 / 60;
    lastFrameTime = timestamp;
    // 防止切标签页后 deltaTime 异常过大（限制最大约3帧的时间量）
    const dt = Math.min(deltaTime, 0.05);

    // === 1. 更新蛇身位置（步进 + 插值） ===
    const stepped = updateSnake(dt);

    // === 2. 辅助线动画状态机 ===
    const ANIM_SPEED = 0.03; // 动画速度（每帧进度增量）

    if (state.axesAnimState === 'in') {
        // 出现动画：从中心向外生长（easeOutCubic 缓动）
        state.axesAnimProgress += ANIM_SPEED;
        if (state.axesAnimProgress >= 1) {
            state.axesAnimProgress = 1;
            state.axesAnimState = 'idle';
        }
        updateAxesAnimation(state.axesAnimProgress);
    } else if (state.axesAnimState === 'out') {
        // 消失动画：从两端向中心收缩（easeInCubic 缓入，速度稍快）
        state.axesAnimProgress -= ANIM_SPEED * 1.5;
        if (state.axesAnimProgress <= 0) {
            state.axesAnimProgress = 0;
            state.axesAnimState = 'idle';
            // 消失完成 → 移除旧辅助线和食物，生成新的
            if (state.foodAxesGroup) {
                state.scene.remove(state.foodAxesGroup);
                state.foodAxesGroup = null;
            }
            if (state.foodMesh) {
                state.scene.remove(state.foodMesh);
                state.foodMesh = null;
            }
            spawnFood();
        }
        // 收缩时使用缓入效果更新辅助线 + 食物同步缩小
        updateAxesAnimation(state.axesAnimProgress);
        if (state.foodMesh) {
            const shrinkScale = Math.max(0.01, easeInCubic(state.axesAnimProgress));
            state.foodMesh.scale.setScalar(shrinkScale);
        }
    }

    // === 3. 碰撞检测（仅在发生步进移动时执行） ===
    // 网格坐标系统的核心优势：不需要无敌帧或特殊时序处理，
    // 因为所有实体都在安全的整数格点上，碰撞判定是精确且无歧义的
    if (stepped) {
        // 食物碰撞检测（仅在非消失动画期间响应）
        if (checkFoodCollision() && state.axesAnimState !== 'out') {
            state.score += 10;
            growSnake();
            // 加速：减小移动间隔（不低于最小值）
            state.moveInterval = Math.max(
                CONFIG.MIN_MOVE_INTERVAL,
                state.moveInterval - CONFIG.SPEED_INCREMENT
            );
            // 触发辅助线+食物消失动画（不立即生成新食物）
            state.axesAnimState = 'out';
            updateUI();
        }

        // 边界碰撞检测
        if (checkBoundaryCollision()) {
            endGame('boundary');
            return;
        }

        // 自身碰撞检测
        if (checkSelfCollision()) {
            endGame('self');
            return;
        }
    }

    // === 4. 食物旋转自旋动画（仅非消失动画期间） ===
    if (state.foodMesh && state.axesAnimState !== 'out') {
        state.foodMesh.rotation.x += 0.015;
        state.foodMesh.rotation.y += 0.02;
    }

    // === 5. 更新相机位置 ===
    updateCamera();

    // === 6. 渲染场景 ===
    state.renderer.render(state.scene, state.camera);
}

/**
 * 结束游戏
 * 停止游戏循环，显示 Game Over 弹窗并展示最终得分和失败原因
 * @param {string} reason - 结束原因标识 ('boundary' = 边界碰撞 | 'self' = 自身碰撞)
 * @returns {void}
 */
function endGame(reason) {
    state.isGameRunning = false;
    state.dom.finalScoreEl.textContent = state.score;

    // 更新失败原因文案
    const reasonEl = document.getElementById('go-reason');
    if (reasonEl) {
        reasonEl.textContent = reason === 'boundary'
            ? '边界碰撞 // Boundary Hit'
            : '自身碰撞 // Self Collision';
    }

    state.dom.gameOverOverlay.classList.add('active');
    console.log(`[GAME OVER] 原因: ${reason === 'boundary' ? '边界碰撞' : '自身碰撞'} | 得分: ${state.score}`);
}

/**
 * 重新开始游戏
 * 完整清理当前场景资源（渲染器/实体/状态），然后重新调用 startGame
 * @returns {void}
 */
export function restartGame() {
    state.dom.gameOverOverlay.classList.remove('active');

    // 清理渲染器和 DOM 中的 canvas 元素
    if (state.renderer) {
        state.renderer.dispose();
        if (state.dom.container.contains(state.renderer.domElement)) {
            state.dom.container.removeChild(state.renderer.domElement);
        }
    }

    // 清空核心引用
    state.scene = null;
    state.camera = null;
    state.renderer = null;
    state.snakeSegments = [];
    state.snakeGridPositions = [];
    state.foodMesh = null;
    state.foodGridPos = null;

    // 重置相机轨道状态为初始值
    state.camTheta = CONFIG.CAMERA_THETA;
    state.camPhi = CONFIG.CAMERA_PHI;
    state.camRadius = CONFIG.CAMERA_RADIUS;
    state.camTargetTheta = CONFIG.CAMERA_THETA;
    state.camTargetPhi = CONFIG.CAMERA_PHI;
    state.camTargetRadius = CONFIG.CAMERA_RADIUS;
    state.isDragging = false;

    // 重置辅助线动画状态
    state.foodAxesGroup = null;
    state.axesAnimProgress = 0;
    state.axesAnimState = 'idle';

    // 取消旧的游戏循环
    if (state.animationId) {
        cancelAnimationFrame(state.animationId);
        state.animationId = null;
    }

    // 重新启动完整游戏流程
    startGame();
}
