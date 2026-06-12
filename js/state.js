/**
 * 全局游戏状态模块
 * 集中管理所有运行时状态变量，各模块通过引用此对象实现状态共享
 * 采用网格坐标系统：蛇身和食物位置以整数格点坐标存储，渲染时插值到浮点位置
 * @module state
 */

/** 游戏全局状态对象 */
const state = {
    /* === Three.js 核心对象 === */
    scene: null,          // THREE.Scene 场景实例
    camera: null,         // THREE.PerspectiveCamera 相机实例
    renderer: null,       // THREE.WebGLRenderer 渲染器实例

    /* === 游戏实体（Mesh 对象） === */
    snakeSegments: [],    // 蛇身所有节的 Mesh 数组（索引0为头部）
    foodMesh: null,       // 食物 Mesh

    /* === 网格坐标系统（逻辑层，与渲染层分离） === */
    /** 蛇身每节的网格坐标数组，每个元素为 {x, y, z} 整数坐标 */
    snakeGridPositions: [],
    /** 食物的网格坐标 {x, y, z} 整数坐标 */
    foodGridPos: null,

    /* === 步进移动控制 === */
    currentDirection: null,   // 当前移动方向 Vector3（单位向量，轴对齐）
    nextDirection: null,      // 下一帧方向 Vector3（缓冲用，防止一帧内多次转向）
    moveTimer: 0,             // 移动计时器（累积值，达到 moveInterval 时触发一步）
    moveInterval: 0,          // 当前每步所需时间间隔（越小越快）

    /* === 运行状态 === */
    score: 0,                 // 当前得分
    isGameRunning: false,     // 游戏是否正在运行
    animationId: null,        // requestAnimationFrame ID
    stepCount: 0,             // 总移动步数（用于速度等级计算显示）

    /* === 相机轨道控制状态（球坐标系统） === */
    camTheta: 0,              // 水平旋转角（绕Y轴）
    camPhi: 0,                // 俯仰角
    camRadius: 0,             // 相机到目标的距离
    camTargetTheta: 0,        // 目标角度（用于平滑插值）
    camTargetPhi: 0,          // 目标俯仰角
    camTargetRadius: 0,       // 目标距离
    isDragging: false,        // 是否正在拖拽鼠标
    lastMouseX: 0,            // 上一帧鼠标X
    lastMouseY: 0,            // 上一帧鼠标Y

    /* === 食物XYZ轴辅助线系统 === */
    foodAxesGroup: null,      // 辅助线容器 Group
    axesAnimProgress: 0,      // 辅助线动画进度 0~1（0=消失, 1=完全显示）
    axesAnimState: 'idle',    // 动画状态: 'in' | 'out' | 'idle'

    /* === 操作模式切换 === */
    controlMode: 'world',     // 'world' = 绝对坐标系 | 'camera' = 相对视角

    /* === DOM 元素引用（由 main.js 初始化） === */
    dom: {
        container: null,      // 游戏画布容器
        scoreDisplay: null,   // 分数显示元素
        lengthDisplay: null,  // 蛇身长度显示
        speedDisplay: null,   // 速度显示
        startOverlay: null,   // 开始界面遮罩
        startBtn: null,       // 开始按钮
        gameOverOverlay: null,// 游戏结束遮罩
        finalScoreEl: null,   // 最终分数显示
        restartBtn: null      // 重新开始按钮
    }
};

export default state;
