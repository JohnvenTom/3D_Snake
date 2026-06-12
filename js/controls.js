/**
 * 键盘控制系统模块
 * 负责键盘事件监听、操作模式切换（World/Camera）、方向映射及反向限制逻辑
 * @module controls
 */

import state from './state.js';
import { isOppositeDirection } from './utils.js';

/**
 * 根据当前相机朝向计算相对方向向量（用于 Camera 模式）
 * 将 WASD 映射到最接近相机视角的 XYZ 主轴方向（严格轴向，无斜角对角）
 * W/S = 相机前方/后方最接近的水平主轴（X 或 Z），A/D = 另一条水平轴，QE = 世界Y轴升降
 * @param {'forward'|'back'|'left'|'right'} direction - 方向标识符
 * @returns {THREE.Vector3} 世界坐标系下的单位轴向向量（严格对齐 XYZ 轴之一）
 */
export function getCameraRelativeDirection(direction) {
    if (state.snakeSegments.length === 0) return new THREE.Vector3();

    const head = state.snakeSegments[0];
    // 相机前方向量 = 从相机位置指向蛇头位置
    const camForward = new THREE.Vector3()
        .subVectors(head.position, state.camera.position)
        .normalize();

    // 提取水平面分量（忽略 Y 轴）
    const fx = camForward.x;
    const fz = camForward.z;

    // 判断相机前方更接近 X 轴还是 Z 轴（取绝对值大的为主轴）
    const isXDominant = Math.abs(fx) >= Math.abs(fz);

    // 根据主导轴确定前方和右方的轴向向量
    let forwardAxis, rightAxis;

    if (isXDominant) {
        // 前方 ≈ X 轴方向（符号由分量决定）
        forwardAxis = fx > 0
            ? new THREE.Vector3(1, 0, 0)    // X+
            : new THREE.Vector3(-1, 0, 0);  // X-
        // 右方 = 对应的 Z 轴
        rightAxis = new THREE.Vector3(0, 0, fz > 0 ? 1 : -1);
    } else {
        // 前方 ≈ Z 轴方向
        forwardAxis = fz > 0
            ? new THREE.Vector3(0, 0, 1)    // Z+
            : new THREE.Vector3(0, 0, -1);  // Z-
        // 右方 = 对应的 X 轴
        rightAxis = new THREE.Vector3(fx > 0 ? 1 : -1, 0, 0);
    }

    switch (direction) {
        case 'forward': return forwardAxis;
        case 'back':     return forwardAxis.clone().negate();
        case 'left':     return rightAxis.clone().negate();
        case 'right':    return rightAxis;
        default:          return new THREE.Vector3();
    }
}

/**
 * 设置键盘事件监听器
 * 支持两种操作模式：
 *   - World 模式：WASD+QE 对应固定世界坐标轴（W=Z- S=Z+ A=X- D=X+ Q=Y+ E=Y-）
 *   - Camera 模式：W=镜头前方 S=镜头后方 A=左 D=右 QE=升降（相对相机视角）
 *   - Tab 键或 UI 按钮可切换两种模式
 * 包含反向转向限制逻辑，防止蛇直接掉头撞向自身
 * @returns {void}
 */
export function setupControls() {
    document.addEventListener('keydown', (event) => {
        if (!state.isGameRunning) return;

        const key = event.key.toLowerCase();
        let newDir = null;

        // Tab 切换操作模式
        if (key === 'tab') {
            event.preventDefault();
            state.controlMode = state.controlMode === 'world' ? 'camera' : 'world';
            updateModeIndicator();
            return;
        }

        switch (key) {
            // ========== WASD 方向键 ==========
            case 'w':
            case 'arrowup':
                newDir = state.controlMode === 'camera'
                    ? getCameraRelativeDirection('forward')
                    : new THREE.Vector3(0, 0, -1);
                break;
            case 's':
            case 'arrowdown':
                newDir = state.controlMode === 'camera'
                    ? getCameraRelativeDirection('back')
                    : new THREE.Vector3(0, 0, 1);
                break;
            case 'a':
            case 'arrowleft':
                newDir = state.controlMode === 'camera'
                    ? getCameraRelativeDirection('left')
                    : new THREE.Vector3(-1, 0, 0);
                break;
            case 'd':
            case 'arrowright':
                newDir = state.controlMode === 'camera'
                    ? getCameraRelativeDirection('right')
                    : new THREE.Vector3(1, 0, 0);
                break;
            // ========== QE 升降（两种模式共用绝对 Y 轴）==========
            case 'q':
                newDir = new THREE.Vector3(0, 1, 0);
                break;
            case 'e':
                newDir = new THREE.Vector3(0, -1, 0);
                break;
            default:
                return;
        }

        // 反向转向限制：新方向不能与当前方向相反（防止直接掉头）
        if (newDir && !isOppositeDirection(newDir, state.currentDirection)) {
            state.nextDirection.copy(newDir);
        }
    });
}

/**
 * 更新模式指示器 UI 显示
 * 高亮控制面板中当前激活的操作按钮，并切换按键说明文字以匹配当前模式
 * @returns {void}
 */
export function updateModeIndicator() {
    const worldEl = document.getElementById('mode-world');
    const cameraEl = document.getElementById('mode-camera');
    const labelW = document.getElementById('label-w');
    const labelS = document.getElementById('label-s');

    if (worldEl && cameraEl) {
        worldEl.classList.toggle('active', state.controlMode === 'world');
        cameraEl.classList.toggle('active', state.controlMode === 'camera');
    }

    // 根据模式更新 W/S 按键提示文字
    if (labelW) {
        labelW.textContent = state.controlMode === 'camera' ? 'Forward' : 'Z- Fwd';
    }
    if (labelS) {
        labelS.textContent = state.controlMode === 'camera' ? 'Back' : 'Z+ Back';
    }

    // 同步更新 A/D 标签
    const labelA = document.querySelector('.ctrl-item:nth-child(4) span:last-child');
    const labelD = document.querySelector('.ctrl-item:nth-child(6) span:last-child');
    if (labelA) labelA.textContent = state.controlMode === 'camera' ? 'Left' : 'X-';
    if (labelD) labelD.textContent = state.controlMode === 'camera' ? 'Right' : 'X+';
}
