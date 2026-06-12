/**
 * 相机轨道控制系统模块
 * 负责球坐标轨道相机的位置更新、鼠标拖拽旋转、滚轮缩放等交互功能
 * @module camera
 */

import CONFIG from './config.js';
import state from './state.js';

/**
 * 更新相机位置（球坐标轨道控制，每帧调用）
 * 相机围绕蛇头做球面运动，使用插值实现平滑过渡效果：
 *   当前角度/距离 → 目标角度/距离（由用户拖拽/滚轮改变的目标值）
 * 最终通过 lerp 平滑移动到目标位置并始终看向蛇头
 * @returns {void}
 */
export function updateCamera() {
    if (state.snakeSegments.length === 0) return;

    const head = state.snakeSegments[0];

    // 平滑插值：当前值 → 目标值（不同轴使用不同灵敏度）
    state.camTheta += (state.camTargetTheta - state.camTheta) * 0.12;
    state.camPhi += (state.camTargetPhi - state.camPhi) * 0.12;
    state.camRadius += (state.camTargetRadius - state.camRadius) * 0.1;

    // 球坐标 → 直角坐标转换，计算相机相对于蛇头的偏移量
    const offset_x = state.camRadius * Math.sin(state.camPhi) * Math.cos(state.camTheta);
    const offset_y = state.camRadius * Math.cos(state.camPhi);
    const offset_z = state.camRadius * Math.sin(state.camPhi) * Math.sin(state.camTheta);

    // 目标位置 = 蛇头位置 + 球坐标偏移
    const targetPosition = new THREE.Vector3(
        head.position.x + offset_x,
        head.position.y + offset_y,
        head.position.z + offset_z
    );

    // 平滑插值移动到目标位置
    state.camera.position.lerp(targetPosition, CONFIG.CAMERA_LERP_FACTOR);

    // 始终看向蛇头
    state.camera.lookAt(head.position);
}

/**
 * 设置相机轨道控制器（鼠标交互事件绑定）
 * 左键拖拽 → 旋转相机视角（水平/垂直），滚轮 → 缩放相机距离
 * 所有用户输入修改的是"目标值"，实际位置由 updateCamera 通过插值平滑过渡
 * @returns {void}
 * @throws {Error} 若 renderer 未初始化则不绑定事件
 */
export function setupCameraControls() {
    if (!state.renderer) return;

    const canvas = state.renderer.domElement;

    // 鼠标按下 — 开始拖拽（仅响应左键）
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            state.isDragging = true;
            state.lastMouseX = e.clientX;
            state.lastMouseY = e.clientY;
            canvas.style.cursor = 'grabbing';
        }
    });

    // 鼠标移动 — 旋转相机轨道角度
    window.addEventListener('mousemove', (e) => {
        if (!state.isDragging) return;

        const deltaX = e.clientX - state.lastMouseX;
        const deltaY = e.clientY - state.lastMouseY;

        // 水平拖拽 → 绕 Y 轴旋转（改变 theta）
        state.camTargetTheta += deltaX * CONFIG.CAMERA_ROTATE_SENSITIVITY;

        // 垂直拖拽 → 改变俯仰角（改变 phi）
        state.camTargetPhi -= deltaY * CONFIG.CAMERA_ROTATE_SENSITIVITY;

        // 限制俯仰角范围，避免相机翻转越过天顶
        state.camTargetPhi = Math.max(
            CONFIG.CAMERA_PHI_MIN,
            Math.min(CONFIG.CAMERA_PHI_MAX, state.camTargetPhi)
        );

        state.lastMouseX = e.clientX;
        state.lastMouseY = e.clientY;
    });

    // 鼠标释放 — 结束拖拽状态
    window.addEventListener('mouseup', () => {
        if (state.isDragging) {
            state.isDragging = false;
            canvas.style.cursor = 'crosshair';
        }
    });

    // 滚轮 — 缩放相机距离（向上拉近，向下拉远）
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 1 : -1;
        state.camTargetRadius += delta * CONFIG.CAMERA_ZOOM_SENSITIVITY;

        // 限制缩放范围在最小/最大半径之间
        state.camTargetRadius = Math.max(
            CONFIG.CAMERA_MIN_RADIUS,
            Math.min(CONFIG.CAMERA_MAX_RADIUS, state.camTargetRadius)
        );
    }, { passive: false });
}
