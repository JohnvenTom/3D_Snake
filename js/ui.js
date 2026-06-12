/**
 * UI 更新模块
 * 负责游戏运行时各面板数据的实时刷新（分数、长度、速度）及动画效果
 * @module ui
 */

import CONFIG from './config.js';
import state from './state.js';

/**
 * 更新 UI 面板上的分数、蛇身长度、速度等级显示
 *
 * 速度计算方式（网格坐标版）：
 *   基于当前移动间隔相对于基础间隔的比值来反算速度倍率。
 *   移动间隔越小 → 蛇移动越快 → 速度倍率越高
 *
 * 分数变化时附带微弹跳动画（bump class 触发 CSS transition）
 * @returns {void}
 */
export function updateUI() {
    state.dom.scoreDisplay.textContent = state.score;
    state.dom.lengthDisplay.textContent = state.snakeSegments.length;

    // 基于移动间隔计算速度倍率（间隔越小越快，基准为 BASE_MOVE_INTERVAL）
    const speedMultiplier = (CONFIG.BASE_MOVE_INTERVAL / state.moveInterval).toFixed(1);
    state.dom.speedDisplay.textContent = parseFloat(speedMultiplier).toFixed(1) + 'x';

    // 分数变化时触发跳动动画（150ms 后移除 class 以便下次触发）
    state.dom.scoreDisplay.classList.add('bump');
    setTimeout(() => state.dom.scoreDisplay.classList.remove('bump'), 150);
}
