# 森口电竞

三角洲护航、娱乐与陪玩工作室的网站和工作室手记。

2025 年 5 月提出构想，2026 年 9 月正式成立。三人小队：森口电竞sendu、创始人森口电竞椰伦苏、森口电竞尘埃。

## 网站内容

- 工作室介绍、服务说明与三位成员。
- 水面光标效果、双向滚动渐入和手记翻页动画。
- 漂流瓶客户评价，以及随公开评价变化的成员星级。
- 招聘页 `/careers/`：招聘方向、类型、职位筛选与申请表跳转。
- 在线修图 `/ps/`：通过网址直接访问。
- 文章与网站设置管理入口：正式网址下的 /admin/。

## 部署到 EdgeOne

在 EdgeOne Pages / Makers 中导入本仓库，生产分支选 main，框架选 Other。edgeone.json 已配置安装和构建命令、输出目录，并指定 EdgeOne 预装的 Node.js 24.18.0。

| 配置项 | 内容 |
| --- | --- |
| 安装命令 | npm install --include=dev |
| 构建命令 | npm run build:site |
| 输出目录 | work/deploy-site/public |
| 加速区域 | 全球可用区（不含中国大陆） |

绑定正式域名后，把 PAGES_BASE_URL 环境变量设为完整的正式网址，再重新部署，使文章和 canonical 使用正式域名。

客户评价接收仓库已配置为 littlesendu/senkou-studio。访客通过 GitHub Issues 投递，工作室审核后展示；成员没有公开评价时默认五星。在线后台连接本仓库的 main 分支，保存内容或通过评价审核后由 EdgeOne 自动重新构建，部署成功后更新公开评价和成员星级。在自己的设备上可选择记住登录 7 天或 30 天，退出时会清除。

完整步骤见 [部署到EdgeOne.md](./部署到EdgeOne.md)。

## 本地预览与内容维护

安装 Node.js 24.18.0（或满足 package.json 要求的版本）后运行：

```sh
npm install --include=dev
node start-preview.cjs
```

打开 http://127.0.0.1:4000/。源文章在 studio-content/source/，站点配置在 studio-content/site.yml，成员与服务设置在 _config.yml。开发缓存和生成文件在 work/，不应上传。

## 在线修图

AI 对话支持联网搜索真实图片、导入为图层，再按任务继续编辑。使用前在 AI 设置中指定支持工具调用的操控 AI；需要生成图片时可另外指定生图 AI。搜图复用现有对话入口，不增加界面按钮。图片通过同域 `/api/ps-images` 下载，保留来源，原图无法获取时会明确标注使用搜索预览图。此功能需要部署网站后端并能够访问搜索服务和图片来源，不需要另填搜图 Key，也不依赖 AI 配置中的“通过本站转发”复选框。

编辑器与博客一起部署，使用同一域名的 /ps/ 路径，不需要另外购买域名或配置服务器。运行文件在 source/ps/，由 Hexo 原样复制，页面使用相对路径，因此也支持博客部署在子目录。

访客打开本地图片、编辑图层，以及下载 PNG 或 PSD 时，不需要 GitHub 账号，也不需要把图片提交到仓库。图片通过浏览器本地文件接口读取，导出到访客设备；只有网站程序更新才需要提交 GitHub。通过网址直接打开 /ps/ 使用编辑器，避免旧版内嵌登录逻辑影响导出。标签页使用工作室配色的画布与画笔图标，SVG 源文件及 ICO 兼容图标位于 source/ps/。

编辑核心更新自用户提供的 Photopea 归档包，界面继续使用本站的中文深色与薄荷绿样式。工具图标、画笔预设弹窗与菜单统一适配；左右工具栏同时从两侧淡入，顶部帮助和打开文件按钮靠右。字体随站点托管，打开图片、图层编辑、PNG／PSD 导出、Camera Raw、CMYK 和 16 位 PSD 已在阻断外网请求的条件下检查。部分云端或 AI 功能仍可能依赖第三方服务，离线回退效果与在线结果可能不同。第三方代码声明见 THIRD_PARTY_NOTICES.md。

运行 `npm run test:editor` 可检查画笔调节、菜单悬停、文件导出和不同屏幕的顶部布局。测试默认在 Windows 使用已安装的 Edge，其他系统使用 Playwright Chromium（首次运行前执行 `npx playwright install chromium`）；可通过 `EDITOR_BROWSER_CHANNEL` 指定浏览器通道。截图和测试导出文件保存在 work/editor-test/，不提交到仓库。

### 外部 AI / aibot 控制接口

运行 `npm run start:ps-api` 启动真实浏览器控制服务，HTTP JSON 入口为 `http://127.0.0.1:4010/api/ps-control`。首次启动生成 64 位十六进制强随机访问令牌，保存在被 Git 忽略的 `work/ps-control/access-token`，重启后继续有效；`work/ps-control/connection.json` 含 aibot 的完整连接信息。也可用 `PS_CONTROL_TOKEN` 环境变量指定令牌（24–512 个非空格 ASCII 字符）。aibot 可以读取工具 Schema，操作图层、中文文字、选区和蒙版，执行编辑器脚本或用截图与鼠标键盘操作其他工具，再导出真实分层的 PSD。每个会话相互隔离。

接口文档在 `/ps/api/`，OpenAPI 在 `/ps/api/openapi.json`，原 `/api/ps-control/openapi.json` 地址保留。文档作为静态 JSON 随网站发布，即使执行服务未连接也可下载导入；编辑操作仍需有效令牌和服务配置。示例：`node examples/ps-control-client.cjs`；验证：`npm run test:ps-api`。Windows 默认使用 Edge，Linux 运行前需要安装 Playwright Chromium 及系统依赖。

GitHub 与 EdgeOne 的现有关联会部署网站和 API 入口；执行修图的浏览器服务需要在可持续运行 Node.js 与浏览器的电脑或服务器上运行。通过网站正式域名接入时，在 EdgeOne 项目生产环境变量中设置以下两项，再重新部署：

| 环境变量 | 内容 |
| --- | --- |
| `PS_CONTROL_URL` | 浏览器服务可达的 HTTPS 根网址，例如 `https://worker.example.com`；不能填本机 localhost、本网站前端 /ps/ 或同一个转发入口。 |
| `PS_CONTROL_TOKEN` | 浏览器服务 connection.json 中的 token 值，与 aibot 使用同一令牌。 |

在 aibot 导入 `https://senkou.xyz/ps/api/openapi.json`，请求地址为 `https://senkou.xyz/api/ps-control`，鉴权头为 `Authorization: Bearer <令牌>`。调用顺序：create_session → list_tools → call_tool → export_file（也是 call_tool）→ close_session。

网站入口和浏览器服务分别校验令牌；缺失或错误返回 401。入口未配置有效令牌或服务地址时，状态为 ready:false，操作返回 503。GET 状态与文档公开，但不授予编辑权限。令牌不放进代码、网址或 GitHub。轮换时同步更新服务和 EdgeOne 的 PS_CONTROL_TOKEN、aibot 凭据，再重启服务并重新部署网站。

## 招聘内容管理

首页“加入我们”进入招聘页。后台 /admin/ 的“招聘管理”可编辑页面介绍与申请方式，增删上方招聘方向、左侧招聘类型和职位。方向可设为游戏服务、工作室运营等；筛选项会根据公开职位自动生成。

新增职位默认草稿，改为“公开招聘”并保存后才展示；改回草稿可暂时撤下。删除仍被职位使用的方向或类型时，需先为关联职位更换分类或删除职位。“申请职位”先弹出“应聘须知与免责声明”。用户需将阅读区滚动到底并点击“我已阅读并同意”，才会前往配置的申请表，当前为工作室问卷星招募表；每次打开须知都会重新锁定同意按钮。电脑支持滚轮、滚动条和键盘，手机支持滑动。未启用 JavaScript 时不能直接绕过此流程。后台可编辑须知、免责声明、“申请表链接”和按钮文字；链接留空时使用网站预约入口，两者均未设置时前往联系页面。当前文案说明招募以娱乐组队与同好交流为主，不承诺固定工资或收入，有偿合作应另行确认，实际权利义务依约定、履行和适用法律确定。

招聘源数据在 studio-content/source/careers/data.json，本地保存会同步源文件与预览，线上保存会提交到 GitHub，并由 EdgeOne 自动部署。源 JSON 不复制到网站输出；若仓库公开，源文件中的草稿仍可通过仓库查看，请勿填入隐私或凭据。

## 开源说明

本项目基于 ZenithSeraph 的 hexo-theme-welkin 修改。原项目采用 MIT 许可证，见 [LICENSE](./LICENSE)；其他依赖与素材声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

两个须知弹窗都支持后台编辑：在“招聘管理 → 申请前必读 · 弹窗内容”中编辑招聘弹窗；在“网站设置 → 预约提交表 · 弹窗内容”中编辑服务弹窗。可修改标题、介绍、重点提示、须知、免责声明和底部提示；服务正文用空行分段，段内可换行，均以纯文本显示。点击“保存修改”后，本地刷新即可查看，在线需等待托管平台部署成功；每次打开仍需阅读到底才可同意并进入对应表单。旧配置未填写新字段时继续使用现有默认文案。
