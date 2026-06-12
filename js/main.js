/**
 * 应用入口模块
 * 负责初始化 DOM 元素引用、绑定全局事件（按钮点击/快捷键）、导出公开 API
 * 是整个应用的唯一入口点，由 index.html 通过 <script type="module"> 引入
 * @module main
 */

import { startGame, restartGame } from './game.js';
import state from './state.js';
import { updateModeIndicator } from './controls.js';

/**
 * 初始化 DOM 元素引用到 state.dom 对象
 * 各子模块通过 state.dom.xxx 访问对应 DOM 节点，避免全局变量污染
 * @returns {void}
 */
function initDOMReferences() {
    state.dom.container = document.getElementById('game-container');
    state.dom.scoreDisplay = document.getElementById('score-display');
    state.dom.lengthDisplay = document.getElementById('length-display');
    state.dom.speedDisplay = document.getElementById('speed-display');
    state.dom.startOverlay = document.getElementById('start-overlay');
    state.dom.startBtn = document.getElementById('start-btn');
    state.dom.gameOverOverlay = document.getElementById('game-over-overlay');
    state.dom.finalScoreEl = document.getElementById('final-score');
    state.dom.restartBtn = document.getElementById('restart-btn');
}

/**
 * 绑定全局 UI 事件监听器
 * 包括：开始按钮、重开按钮、模式切换按钮、键盘快捷键（Enter/Space 快速开始或重开）
 * @returns {void}
 */
function bindEvents() {
    // 开始按钮 → 启动游戏
    state.dom.startBtn.addEventListener('click', startGame);

    // 重新开始按钮 → 清理并重启
    state.dom.restartBtn.addEventListener('click', restartGame);

    // WORLD 模式按钮切换
    document.getElementById('mode-world').addEventListener('click', () => {
        state.controlMode = 'world';
        updateModeIndicator();
    });

    // CAMERA 模式按钮切换
    document.getElementById('mode-camera').addEventListener('click', () => {
        state.controlMode = 'camera';
        updateModeIndicator();
    });

    // 全局键盘快捷键：Enter 或 Space 在非游戏运行时触发开始/重开
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !state.isGameRunning) {
            if (!state.dom.startOverlay.classList.contains('hidden')) {
                // 处于开始界面 → 启动游戏
                startGame();
            } else if (state.dom.gameOverOverlay.classList.contains('active')) {
                // 处于结束弹窗 → 重新开始
                restartGame();
            }
        }
    });
}

// ==================== 入口执行 ====================
// 页面加载完成后自动执行初始化
initDOMReferences();
bindEvents();
