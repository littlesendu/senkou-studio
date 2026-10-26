# 森口电竞：部署到 EdgeOne

这份说明对应本项目的构建脚本。源码可以保存在 GitHub，访客通过绑定到 EdgeOne 的域名访问网站。

## 1. 上传源码

在自己的 GitHub 账号下新建仓库，例如 senkou-studio。若要沿用当前的客户评价投递方式，请使用公开仓库并启用 Issues。

打开为本次部署整理的 edgeone-source-20261019 文件夹，全选里面的文件和子文件夹，拖入仓库的 Upload files 页面并提交。仓库根目录应直接看到 package.json、build-site.cjs、layout、source、studio-content 等；不要把最外层文件夹也套进去。

这个上传文件夹没有本地运行环境、缓存、待审核评价和 GitHub Pages 专用工作流。

## 2. 在 EdgeOne 创建项目

进入 Pages / Makers，选择新建项目、导入 Git 仓库，连接 GitHub，授权并选择刚才的仓库。生产分支选择实际上传源码的分支，通常为 main。

## 3. 填写构建配置

项目已提供 edgeone.json，自动指定安装命令、构建命令和输出目录。界面仍要求填写时，使用下表。

| 配置项 | 填写内容 |
| --- | --- |
| 框架预设 | Other / 其他 |
| Node.js 版本 | 24.18.0（由 edgeone.json 指定） |
| 根目录 | ./（仓库根目录，保留默认值） |
| 安装命令 | npm install --include=dev |
| 构建命令 | npm run build:site |
| 输出目录 | work/deploy-site/public |
| 加速区域 | 全球可用区（不含中国大陆） |

edgeone.json 中的 nodeVersion 指定为平台预装的 Node.js 24.18.0。仓库不放 .nvmrc，避免触发额外下载、切换到平台未预装的版本；控制台如需手动选择，也选择 24.18.0。

客户评价接收仓库已配置为 littlesendu/senkou-studio，无需再添加 GITHUB_REPOSITORY。以后如果更换仓库，请更新 _config.yml 中 studio.reviews.repository。

然后点击部署，等待构建完成。

## 4. 绑定域名

在项目的域名管理中添加已购买的域名，再到域名服务商的 DNS 控制台，按 EdgeOne 给出的名称和目标值添加 CNAME 等所需记录。以控制台实际要求为准。

等待域名验证与 HTTPS 配置完成。平台默认域名在中国大陆有预览访问限制，长期公开访问应绑定自定义域名；“全球可用区（不含中国大陆）”不要求工信部备案。

绑定成功后，在 EdgeOne 环境变量中添加 PAGES_BASE_URL，填写完整的正式网址（包括 https://）。重新部署一次，让文章网址、canonical 等也使用正式域名。

## 5. 使用网站后台

在正式网址后添加 /admin/ 进入后台。连接自己的 GitHub 仓库和生产分支，访问令牌需要这个仓库的 Contents 读写权限；审核客户评价还需要 Issues 读写权限。默认不保存令牌；在自己的设备上可勾选“在此浏览器记住登录”，选择 7 天或 30 天，连接成功后会保存在此浏览器，后续自动连接。到期或点击“退出并清除登录”会清除记住的信息；GitHub 令牌若提前失效，仍需重新连接。不要把令牌上传到仓库。

保存内容或通过评价审核会生成一次 GitHub 提交，EdgeOne 自动构建部署成功后，访客才能看到更新。后台“已通过审核”表示评价已写入仓库；公开评价和成员星级随成功部署一起更新，无需再手动上传。若一直没变化，请检查后台保存分支与 EdgeOne 生产分支是否一致，以及最新部署是否成功。

目前客户投递评价仍需要登录 GitHub。托管迁移不会改变这一点；要让访客直接匿名投递，需要另接评价服务。

## 常见问题

- 提示 Failed to switch to Node.js：先确认部署使用最新的 main 提交，且仓库不含旧的 .nvmrc；edgeone.json 应指定平台预装的 nodeVersion 24.18.0。

- 提示找不到 package.json：检查是否把最外层上传文件夹也一起传入，导致仓库多套了一层目录。
- 提示找不到 Hexo 或 js-yaml：确认安装命令包含 --include=dev。
- 部署后 404：确认输出目录完整填写 work/deploy-site/public。
- 修改环境变量后仍显示旧内容：环境变量只影响新的构建，需要重新部署。
- 后台保存后网站未变化：检查保存分支是否与 EdgeOne 生产分支相同，以及最新部署是否成功。

## 在线修图的 aibot 控制接口（云端沙箱）

`/api/ps-control` 默认把编辑会话交给 EdgeOne Agent 沙箱执行，不再需要另找服务器。仓库根目录的 `agents/ps-control-worker/index.ts` 是执行端，`edgeone.json` 的 `agents` 段声明目录、运行时与超时：

| 配置项 | 值 | 说明 |
| --- | --- | --- |
| `dir` | `agents` | 每个子目录一个路由，`ps-control-worker` 对应对外路径 `/ps-control-worker`。 |
| `runtime` | `agent-node:1` | 入口是 TypeScript，必须用 Node 运行时。 |
| `timeout` | `120` | 单次执行上限（秒），与转发层 110 秒超时配合。 |
| `idleTimeout` / `maxLifetime` | `1800` / `7200` | 会话空闲与会话总寿命（秒）。 |
| `sandbox.timeout` | `1800` | 沙箱实例寿命，工具执行成功后会续期。 |
| `externalNodeModules` | `playwright` | 沙箱镜像自带浏览器，这里只装库，不下载浏览器。 |

上游会把 `makers-conversation-id` 头部传进执行端，平台要求它是 6–36 个 `[0-9a-zA-Z-_.]` 字符，因此会话编号是 32 位十六进制；`create_session` 之外的动作必须带同一个编号，代理会自动生成。

沙箱的连接信息由 SDK 提供，`sandbox.browser.cdpUrl` 形如 `https://…/cdp?access_token=…`。Playwright 只认 `webSocketDebuggerUrl`、不会沿用查询串，所以 `lib/ps-control-cloud.mjs` 会先自己发现 ws 地址、把 `access_token` 带上再 `connectOverCDP`。改动这段逻辑时保持这个顺序，否则会出现 401。

部署后用 `{"action":"diagnose"}` 逐步确认 sandbox → commands → cdp-url → cdp-connect → new-page → page。任何一步失败，返回里的 `step` 与 `error` 就是原因；普通编辑失败时 `error.stage` 也会指出阶段。

已知限制：单次请求体 5 MB（上传图片建议压到 3.5 MB 以内），单次执行 120 秒，最多 4 个会话，闲置 30 分钟回收。导出方向没有 5 MB 限制。要在排查时查看执行端日志，去 EdgeOne 控制台的 Agent 运行记录里搜 `PS cloud operation failed at`。

如果暂时不想用沙箱，设置 `PS_CONTROL_URL` 指到一台常开的浏览器服务即可切回外部 worker，代码和 OpenAPI 不变。

这是 2026-10-19 整理的首次上传副本。后续以 GitHub 仓库及原项目中的最新文件为准。


## 在线 PS 的 AI 跨域转发

在线 PS 默认直接调用用户填写的平台。遇到平台不允许浏览器跨域请求时，在“编辑 → 首选项 → AI 设置”的对应平台配置中勾选“通过本站转发（解决跨域）”，测试连接后保存。操控 AI 与生图 AI 可分别开启。

转发由仓库根目录的 Cloud Function `cloud-functions/api/ps-ai.js` 提供，对应同域路径 `/api/ps-ai`。EdgeOne 构建时须包含仓库根目录的云函数与 `lib/ps-ai-proxy.mjs`，不能只上传静态的 public 目录。通过 GitHub 导入此仓库的项目会随提交一起部署；本地使用 `node start-preview.cjs` 的预览服务也提供同一接口。

默认仅允许转发 `openaiapi.cc`。如需添加其他可信平台，在 EdgeOne 项目的云函数环境变量中设置 `PS_AI_ALLOWED_HOSTS`，值为英文逗号分隔的完整域名，例如 `openaiapi.cc,api.deepseek.com,api.openai.com`；设置后会替代默认列表。域名不能包含协议、端口、路径、通配符或 IP 地址。修改环境变量后重新部署。

EdgeOne 的云函数请求 URL 可能使用内部域名，来源校验因此单独允许本站正式域名 `https://senkou.xyz` 与 `https://www.senkou.xyz`。迁移到其他正式域名时，可用 `PS_AI_ALLOWED_ORIGINS` 设置英文逗号分隔的完整 HTTPS 来源（例如 `https://example.com,https://www.example.com`，不含末尾斜杠）；设置后替代默认正式来源。代码不信任客户端提供的转发域名头，仍拒绝站外浏览器请求。

诊断时先访问 `/api/ps-ai`，正常返回 JSON 服务标识与版本号。模型列表或对话报错需分别检查实际请求：健康检查成功不代表转发调用成功。服务器 502 等运行错误不会再误报为接口未部署；也无需重新填写 Key。

服务器无需配置用户的 API Key。Key 由当前请求携带，只发送到白名单内的 HTTPS AI 接口；代码不记录或持久化 Key、对话、参考图及生成结果。接口只转发模型列表、Chat / Responses、Images 和 Gemini 的常用路径，不接受任意网页地址、跳转或站外来源请求。云函数的请求与响应均受平台的 6 MB 上限约束。请求超限时，本站会提示缩小参考图、开始新对话或使用平台直连；生成结果过大时也可能超过平台响应限制。转发等待上限为 110 秒，edgeone.json 中已将云函数最大执行时长设为 120 秒。

当前中转站可分别新增两份配置：操控使用 Chat API 与模型 `gpt-5.5`；生图使用 Images API 与模型 `gpt-image-1`。根地址均为 `https://openaiapi.cc/v1`，分别填入用户自己的 Key，均勾选转发。是否支持其他模型及图像编辑，以平台实际返回为准。

## 在线修图的联网搜图

现有 AI 对话支持 `search_images` 和 `import_image`：先搜索真实网络图片，再导入可撤销的独立图层，继续调用编辑器工具或生图 AI。需要配置支持工具调用的操控 AI；只配置生图 AI 无法搜索网页。界面和入口保持原样。

同域接口 `GET /api/ps-images` 由 `cloud-functions/api/ps-images.js` 和 `lib/ps-image-search.mjs` 提供，随 GitHub 仓库一起部署。开发服务器也接入同一处理器。只更新静态文件无法启用此功能。接口不需要新的环境变量或搜索 API Key；自定义来源沿用 `PS_AI_ALLOWED_ORIGINS`。

搜索当前使用 Bing 图片公开结果，依赖该服务及图片来源站点可访问。结果在进程内缓存 5 分钟；冷启动时会重新搜索并核对素材编号。搜索服务验证、结构变化、原站拒绝下载时会返回明确错误，可更换搜索词或结果重试。保留来源页、标题和图片质量说明，搜索结果不代表已获得图片使用授权。

下载只接受搜索结果中的公开 HTTP(S) 图片，逐次检查重定向并固定公开 DNS 地址，拒绝内网地址；不向搜索服务或图片来源发送用户的 AI Key、Cookie。原图不可下载时尝试搜索预览图，并在对话中明确标注。单张来源图片最多 12 MB、6400 万像素，转换为最长边 2560 像素的 WebP，响应限制在 4.5 MB 内；这些是网络素材下载限制，不限制编辑器整个画布。

`edgeone.json` 将 `sharp` 列入 `cloudFunctions.nodejs.externalNodeModules`，使云端打包保留图片转换依赖的原生模块；不要删除这项配置，否则搜图函数可能在启动时返回 502。
