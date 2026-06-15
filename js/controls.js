/**
 * 键盘控制系统模块
 * 负责键盘事件监听、操作模式切换（World/Camera）、方向映射及反向限制逻辑
 * @module controls
 */

import state from './state.js';
import { isOppositeDirection } from './utils.js';

/**
 * 根据当前相机朝向计算屏幕空间相对方向向量（用于 Camera 模式）
 *
 * Camera 模式的按键布局（纯屏幕空间）：
 *   W = 屏幕上方（相机视角的"上"）
 *   S = 屏幕下方（相机视角的"下"）
 *   A = 屏幕左方（相机视角的"左"）
 *   D = 屏幕右方（相机视角的"右"）
 *   Q = 远离镜头（进入屏幕深处，即相机前方）
 *   E = 靠近镜头（从屏幕深处出来，即相机后方）
 *
 * 每个方向通过计算相机的局部坐标轴向量，然后取绝对值最大的分量
 * 映射到最近的 XYZ 主轴方向，确保蛇移动始终是轴对齐的
 *
 * @param {'screenUp'|'screenDown'|'screenLeft'|'screenRight'|'camAway'|'camToward'} direction - 方向标识符
 * @returns {THREE.Vector3} 世界坐标系下的单位轴向向量（严格对齐 ±X/±Y/±Z 之一）
 */
export function getCameraRelativeDirection(direction) {
    if (state.snakeSegments.length === 0) return new THREE.Vector3();

    const head = state.snakeSegments[0];

    // === 构建相机局部坐标系的三条轴 ===

    // 前方：从相机指向蛇头（= 进入屏幕深处的方向）
    const camForward = new THREE.Vector3()
        .subVectors(head.position, state.camera.position)
        .normalize();

    // 右方：前方向量 × 世界上方 的叉积（右手坐标系）
    const worldUp = new THREE.Vector3(0, 1, 0);
    const camRight = new THREE.Vector3()
        .crossVectors(camForward, worldUp)
        .normalize();

    // 上方：右方向量 × 前方向量 的叉积（保证正交右手系）
    const camUp = new THREE.Vector3()
        .crossVectors(camRight, camForward)
        .normalize();

    // === 根据按键选择原始方向向量 ===
    let rawDir;
    switch (direction) {
        case 'screenUp':    rawDir = camUp; break;         // W = 屏幕上方
        case 'screenDown':  rawDir = camUp.clone().negate(); break; // S = 屏幕下方
        case 'screenLeft':  rawDir = camRight.clone().negate(); break; // A = 屏幕左方
        case 'screenRight': rawDir = camRight; break;       // D = 屏幕右方
        case 'camAway':     rawDir = camForward; break;      // Q = 远离镜头（进深处）
        case 'camToward':   rawDir = camForward.clone().negate(); break; // E = 靠近镜头（出深处）
        default: return new THREE.Vector3();
    }

    // === 将方向向量吸附到最近的 XYZ 主轴 ===
    // 取绝对值最大的分量作为主轴方向，确保蛇移动是轴对齐的
    const ax = Math.abs(rawDir.x);
    const ay = Math.abs(rawDir.y);
    const az = Math.abs(rawDir.z);

    if (ax >= ay && ax >= az) {
        return new THREE.Vector3(Math.sign(rawDir.x), 0, 0);  // X 轴主导
    } else if (ay >= ax && ay >= az) {
        return new THREE.Vector3(0, Math.sign(rawDir.y), 0);  // Y 轴主导
    } else {
        return new THREE.Vector3(0, 0, Math.sign(rawDir.z));  // Z 轴主导
    }
}

/**
 * 设置键盘事件监听器
 * 支持两种操作模式：
 *   - World 模式：WASD+QE 对应固定世界坐标轴（W=Z- S=Z+ A=X- D=X+ Q=Y+ E=Y-）
 *   - Camera 模式：W/S=屏幕上下 A/D=屏幕左右 Q/E=远离/靠近镜头（纯屏幕空间）
 *   - Tab 键或 UI 按钮可切换两种模式
 * 包含反向转向限制逻辑，防止蛇直接掉头撞向自身
 * @returns {void}
 */
export function setupControls() {
    document.addEventListener('keydown', (event) => {
        if (!state.isGameRunning) return;

        const key = event.key.toLowerCase();

        // 空格键：按住加速
        if (key === ' ' || event.code === 'Space') {
            event.preventDefault(); // 防止页面滚动
            state.isSpeedBoost = true;
            return;
        }

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
                    ? getCameraRelativeDirection('screenUp')
                    : new THREE.Vector3(0, 0, -1);
                break;
            case 's':
            case 'arrowdown':
                newDir = state.controlMode === 'camera'
                    ? getCameraRelativeDirection('screenDown')
                    : new THREE.Vector3(0, 0, 1);
                break;
            case 'a':
            case 'arrowleft':
                newDir = state.controlMode === 'camera'
                    ? getCameraRelativeDirection('screenLeft')
                    : new THREE.Vector3(-1, 0, 0);
                break;
            case 'd':
            case 'arrowright':
                newDir = state.controlMode === 'camera'
                    ? getCameraRelativeDirection('screenRight')
                    : new THREE.Vector3(1, 0, 0);
                break;
            // ========== QE 键 ==========
            case 'q':
                // World 模式：Y+ 上升 | Camera 模式：远离镜头（进屏幕深处）
                newDir = state.controlMode === 'camera'
                    ? getCameraRelativeDirection('camAway')
                    : new THREE.Vector3(0, 1, 0);
                break;
            case 'e':
                // World 模式：Y- 下降 | Camera 模式：靠近镜头（出屏幕深处）
                newDir = state.controlMode === 'camera'
                    ? getCameraRelativeDirection('camToward')
                    : new THREE.Vector3(0, -1, 0);
                break;
            default:
                return;
        }

        // 反向转向限制：新方向不能与当前方向相反（防止直接掉头）
        if (newDir && !isOppositeDirection(newDir, state.currentDirection)) {
            state.nextDirection.copy(newDir);
        }
    });

    // 空格键松开：取消加速
    document.addEventListener('keyup', (event) => {
        if (event.key === ' ' || event.code === 'Space') {
            state.isSpeedBoost = false;
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
        labelW.textContent = state.controlMode === 'camera' ? '↑ Up' : 'Z- Fwd';
    }
    if (labelS) {
        labelS.textContent = state.controlMode === 'camera' ? '↓ Down' : 'Z+ Back';
    }

    // 同步更新 A/D 标签
    const labelA = document.querySelector('.ctrl-item:nth-child(4) span:last-child');
    const labelD = document.querySelector('.ctrl-item:nth-child(6) span:last-child');
    if (labelA) labelA.textContent = state.controlMode === 'camera' ? '← Left' : 'X-';
    if (labelD) labelD.textContent = state.controlMode === 'camera' ? '→ Right' : 'X+';

    // 同步更新 Q/E 标签
    const labelQ = document.querySelector('.ctrl-item:nth-child(2) span:last-child');
    const labelE = document.querySelector('.ctrl-item:nth-child(3) span:last-child');
    if (labelQ) labelQ.textContent = state.controlMode === 'camera' ? 'Away' : 'Y+ Up';
    if (labelE) labelE.textContent = state.controlMode === 'camera' ? 'Toward' : 'Y- Down';
}
