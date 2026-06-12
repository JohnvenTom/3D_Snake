/**
 * Three.js 场景初始化与构建模块
 * 负责场景、相机、渲染器、灯光、地面、边界等基础环境的创建与管理
 * @module scene
 */

import CONFIG from './config.js';
import state from './state.js';

/**
 * 初始化 Three.js 核心场景组件
 * 创建场景、透视相机、WebGL渲染器，并依次搭建灯光/地面/边界等环境
 * @returns {void}
 */
export function initScene() {
    // 创建场景
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(CONFIG.COLOR_BG);
    state.scene.fog = new THREE.FogExp2(CONFIG.COLOR_BG, 0.015);

    // 创建透视相机
    state.camera = new THREE.PerspectiveCamera(
        55,
        window.innerWidth / window.innerHeight,
        0.1,
        200
    );

    // 使用球坐标设置初始相机位置（围绕原点）
    const initCamX = CONFIG.CAMERA_RADIUS * Math.sin(CONFIG.CAMERA_PHI) * Math.cos(CONFIG.CAMERA_THETA);
    const initCamY = CONFIG.CAMERA_RADIUS * Math.cos(CONFIG.CAMERA_PHI);
    const initCamZ = CONFIG.CAMERA_RADIUS * Math.sin(CONFIG.CAMERA_PHI) * Math.sin(CONFIG.CAMERA_THETA);
    state.camera.position.set(initCamX, initCamY, initCamZ);

    // 创建渲染器
    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.dom.container.appendChild(state.renderer.domElement);

    // 搭建子环境
    setupLights();
    createGround();
    createBoundaryHelper();

    // 监听窗口大小变化
    window.addEventListener('resize', onWindowResize);
}

/**
 * 设置场景灯光系统
 * 包含环境光、定向主光源、补光、底部反光和氛围点光源
 * 配色匹配霓虹粗野主义风格（冷调底+暖白主光+荧光绿补光+珊瑚橙底光）
 * @returns {void}
 */
function setupLights() {
    // 环境光 - 冷调低饱和基础照明
    const ambientLight = new THREE.AmbientLight(0x22202a, 0.55);
    state.scene.add(ambientLight);

    // 定向主光源 - 从右上方照射的暖白光
    const mainLight = new THREE.DirectionalLight(0xfff5e6, 0.85);
    mainLight.position.set(15, 25, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    mainLight.shadow.camera.near = 1;
    mainLight.shadow.camera.far = 60;
    mainLight.shadow.camera.left = -20;
    mainLight.shadow.camera.right = 20;
    mainLight.shadow.camera.top = 20;
    mainLight.shadow.camera.bottom = -20;
    state.scene.add(mainLight);

    // 补光 - 荧光绿色调，从左前方填充
    const fillLight = new THREE.DirectionalLight(0xc8ff00, 0.18);
    fillLight.position.set(-10, 8, -8);
    state.scene.add(fillLight);

    // 底部反光 - 珊瑚橙色调，增加底部层次
    const rimLight = new THREE.DirectionalLight(0xff5733, 0.1);
    rimLight.position.set(0, -15, 5);
    state.scene.add(rimLight);

    // 点光源 - 在食物位置附近提供动态氛围光
    const atmospherePoint = new THREE.PointLight(0xff5733, 0.15, 30);
    atmospherePoint.position.set(5, 5, 5);
    state.scene.add(atmospherePoint);
}

/**
 * 创建地面平面与网格辅助
 * 使用暗色调材质地面 + 荧光绿网格线，位于场景底部
 * @returns {void}
 */
function createGround() {
    const groundSize = CONFIG.ARENA_SIZE * 2 + 4;

    // 地面实体 - 近黑深色
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x0d0b0e,
        roughness: 0.92,
        metalness: 0.08,
        transparent: true,
        opacity: 0.9
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -CONFIG.ARENA_SIZE - 0.01;
    ground.receiveShadow = true;
    state.scene.add(ground);

    // 网格辅助线 - 荧光绿主轴 + 暗色次轴
    const gridHelper = new THREE.GridHelper(
        groundSize,
        Math.floor(groundSize / 2),
        CONFIG.COLOR_GRID_PRIMARY,
        CONFIG.COLOR_GRID_SECONDARY
    );
    gridHelper.position.y = -CONFIG.ARENA_SIZE + 0.02;
    gridHelper.material.opacity = 0.28;
    gridHelper.material.transparent = true;
    state.scene.add(gridHelper);
}

/**
 * 创建场景边界线框辅助
 * 用荧光绿半透明线框显示可活动空间的立方体范围
 * @returns {void}
 */
function createBoundaryHelper() {
    const size = CONFIG.ARENA_SIZE * 2;
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size));
    const lineMat = new THREE.LineBasicMaterial({
        color: CONFIG.COLOR_BOUNDARY,
        transparent: true,
        opacity: 0.1
    });
    const boundaryLines = new THREE.LineSegments(edges, lineMat);
    state.scene.add(boundaryLines);
}

/**
 * 窗口大小变化适配处理
 * 动态更新相机纵横比和渲染器尺寸，保持画面比例正确
 * @returns {void}
 * @listens window:resize
 */
export function onWindowResize() {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
}
