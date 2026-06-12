/**
 * 游戏配置常量模块
 * 集中管理所有可调参数，便于统一调整和后续扩展
 * 采用网格坐标系统：蛇和食物只出现在整数格点上，从根本上避免碰撞误判
 * @module config
 */

const CONFIG = {
    /** 场景立方体空间半边长（总范围为 -SIZE ~ +SIZE，共 SIZE*2+1 个格子） */
    ARENA_SIZE: 14,
    /** 网格单元大小（每格边长，蛇每次移动恰好前进一格） */
    GRID_UNIT: 1.0,
    /** 蛇身单节视觉尺寸（略小于网格单元，避免相邻节视觉重叠） */
    SEGMENT_SIZE: 0.85,
    /** 初始蛇身长度（含头部） */
    INITIAL_LENGTH: 4,
    /**
     * 基础移动间隔（每步所需累积的时间量）
     * 值越大蛇移动越慢，每吃一个食物后此值递减以加速
     */
    BASE_MOVE_INTERVAL: 0.28,
    /** 每吃一个食物后的加速量（从移动间隔中减去） */
    SPEED_INCREMENT: 0.008,
    /** 最小移动间隔上限（蛇最快速度） */
    MIN_MOVE_INTERVAL: 0.1,
    /** 渲染插值基础系数（0~1，配合动态 dt 计算实际每帧 lerp 系数，值越大移动越跟手） */
    RENDER_LERP_FACTOR: 0.32,

    /* === 相机系统参数 === */
    /** 相机平滑跟随插值系数（0~1，越大越灵敏） */
    CAMERA_LERP_FACTOR: 0.08,
    /** 相机初始距离（蛇头到相机的直线距离） */
    CAMERA_RADIUS: 32,
    /** 相机最小缩放距离 */
    CAMERA_MIN_RADIUS: 12,
    /** 相机最大缩放距离 */
    CAMERA_MAX_RADIUS: 60,
    /** 相机初始水平角度（弧度，绕Y轴旋转） */
    CAMERA_THETA: Math.PI / 4,
    /** 相机初始俯仰角（弧度，0=水平 PI/2=正上方） */
    CAMERA_PHI: Math.PI / 3,
    /** 鼠标拖拽旋转灵敏度 */
    CAMERA_ROTATE_SENSITIVITY: 0.005,
    /** 滚轮缩放灵敏度 */
    CAMERA_ZOOM_SENSITIVITY: 0.8,
    /** 相机俯仰角限制（避免翻转） */
    CAMERA_PHI_MIN: 0.15,
    CAMERA_PHI_MAX: Math.PI - 0.15,

    /* === 配色常量（与CSS设计令牌同步） === */
    COLOR_BG: 0x0a0908,
    COLOR_SNAKE_HEAD: 0xc8ff00,      // 荧光绿
    COLOR_SNAKE_BODY_BASE: 0x7cb000,  // 深绿
    COLOR_FOOD: 0xff5733,             // 珊瑚橙
    COLOR_GRID_PRIMARY: 0xc8ff00,     // 荧光绿
    COLOR_GRID_SECONDARY: 0x2a2520,   // 暗网格
    COLOR_BOUNDARY: 0xc8ff00          // 边界框
};

export default CONFIG;
