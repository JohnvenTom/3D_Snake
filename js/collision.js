/**
 * 碰撞检测模块（网格坐标版）
 * 所有碰撞判定均基于整数网格坐标的精确匹配，不再使用距离阈值
 * 彻底消除连续移动系统中的碰撞歧义和误判问题
 * @module collision
 */

import CONFIG from './config.js';
import state from './state.js';

/**
 * 检测蛇头是否与食物处于同一网格格点（即吃到食物）
 * 直接比较整数网格坐标，精确无误
 * @returns {boolean} 是否吃到食物（头部格点与食物格点完全一致）
 */
export function checkFoodCollision() {
    if (!state.foodGridPos || state.snakeGridPositions.length === 0) return false;
    const head = state.snakeGridPositions[0];
    return (
        head.x === state.foodGridPos.x &&
        head.y === state.foodGridPos.y &&
        head.z === state.foodGridPos.z
    );
}

/**
 * 检测蛇头是否超出场景边界
 * 边界为 +/- ARENA_SIZE 的立方体空间（闭区间，包含边界本身）
 * 由于使用整数网格坐标，判定为任一轴向坐标的绝对值 > ARENA_SIZE 即为越界
 * @returns {boolean} 是否撞到边界（任一轴向超出范围即为碰撞）
 */
export function checkBoundaryCollision() {
    if (state.snakeGridPositions.length === 0) return false;
    const head = state.snakeGridPositions[0];
    return (
        Math.abs(head.x) > CONFIG.ARENA_SIZE ||
        Math.abs(head.y) > CONFIG.ARENA_SIZE ||
        Math.abs(head.z) > CONFIG.ARENA_SIZE
    );
}

/**
 * 检测蛇头是否与自身身体占据同一网格格点
 * 从第4节开始检测（前3节因相邻关系不可能重合，跳过以减少计算）
 * 使用精确的整数坐标比较，不存在"距离过近误判"的问题
 * @returns {boolean} 是否撞到自身（头部格点与某节身体格点完全一致）
 */
export function checkSelfCollision() {
    if (state.snakeGridPositions.length <= 4) return false;
    const head = state.snakeGridPositions[0];

    // 从第4节开始逐节比较网格坐标
    for (let i = 4; i < state.snakeGridPositions.length; i++) {
        const seg = state.snakeGridPositions[i];
        if (head.x === seg.x && head.y === seg.y && head.z === seg.z) {
            return true;
        }
    }
    return false;
}

/**
 * 检测蛇头是否与任何障碍物占据同一网格格点
 * 遍历所有障碍物的网格坐标，与头部坐标进行精确匹配
 * 碰撞到障碍物会导致游戏结束（与边界/自身碰撞同等对待）
 * @returns {boolean} 是否撞到障碍物（头部格点与某障碍物格点完全一致）
 */
export function checkObstacleCollision() {
    if (state.obstacleGridPositions.length === 0 || state.snakeGridPositions.length === 0) return false;
    const head = state.snakeGridPositions[0];

    // 遍历所有障碍物位置进行精确匹配
    for (const obs of state.obstacleGridPositions) {
        if (head.x === obs.x && head.y === obs.y && head.z === obs.z) {
            return true;
        }
    }
    return false;
}
