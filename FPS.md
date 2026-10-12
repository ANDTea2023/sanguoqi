# NIGHTFALL 战术射击

双击项目目录中的 `启动射击游戏.cmd`。启动器检查依赖、仅检查射击游戏源码并构建到 `dist-fps/`，随后打开 <http://127.0.0.1:5189/>。游玩时保持启动窗口打开；按 Ctrl+C 停止服务。

需要 Node.js 20.19+ 或 22.12+。首次启动缺少依赖时会执行 `npm ci --no-audit --no-fund`。

## 操作

- 点击游戏画面进入战术视角，鼠标控制方向。
- WASD 移动，Shift 加速，鼠标左键或空格射击。
- R 换弹，Esc 暂停并释放鼠标；再次点击画面继续。切换窗口也会暂停。
- 如果浏览器不允许锁定鼠标，点击“使用拖动瞄准”，按住右键拖动调整方向，左键开火。
- 准星为屏幕正中央的亮色小点。
- 完成三个敌人波次，或在任务结束后点击“重新部署”再玩一局。

## 独立构建与服务

在项目目录执行以下命令。构建只包含 `fps.html`、`src/fps-main.ts`、`src/fps.ts` 与 `src/style.css`，不导入象棋入口或规则文件。

```powershell
node .\node_modules\typescript\bin\tsc --project .\tsconfig.fps.json
node .\node_modules\vite\bin\vite.js build --config .\vite.fps.config.ts
node .\scripts\serve-fps.mjs --no-open
```

服务绑定 `127.0.0.1:5189`，`/` 返回 `dist-fps/fps.html`，静态资源使用正确的 MIME 类型，全部响应设置 `Cache-Control: no-store`。`/__fps_health` 提供本地服务状态。如果之前的射击游戏服务仍在运行，启动器会复用该服务。

运行完整启动流程且不自动打开浏览器：

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fps.ps1 -NoOpen
```

FPS 的独立构建输出 `dist-fps/`；象棋的原有启动方式与 `dist/` 分开使用。射击页面挂载失败时会显示重试按钮，可保持服务窗口打开后重新加载。
