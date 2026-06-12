/**
 * 通用工具函数模块
 * 提供缓动计算、方向判断等纯函数工具
 * @module utils
 */

/**
 * 缓动函数：三次方缓出（先快后慢，用于辅助线生长动画）
 * @param {number} t - 输入进度 0~1
 * @returns {number} 缓动后的进度值
 */
export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * 缓动函数：三次方缓入（先慢后快，用于辅助线消失动画）
 * @param {number} t - 输入进度 0~1
 * @returns {number} 缓动后的进度值
 */
export function easeInCubic(t) {
    return t * t * t;
}

/**
 * 判断两个方向向量是否为相反方向
 * 用于防止蛇直接掉头撞向自身
 * @param {THREE.Vector3} dir1 - 方向向量1
 * @param {THREE.Vector3} dir2 - 方向向量2
 * @returns {boolean} 是否为相反方向（点积 < -0.9 视为反向）
 */
export function isOppositeDirection(dir1, dir2) {
    return dir1.dot(dir2) < -0.9;
}
