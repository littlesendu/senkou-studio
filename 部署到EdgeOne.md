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

这是 2026-10-19 整理的首次上传副本。后续以 GitHub 仓库及原项目中的最新文件为准。


## 在线 PS 的 AI 跨域转发

在线 PS 默认直接调用用户填写的平台。遇到平台不允许浏览器跨域请求时，在“编辑 → 首选项 → AI 设置”的对应平台配置中勾选“通过本站转发（解决跨域）”，测试连接后保存。操控 AI 与生图 AI 可分别开启。

转发由仓库根目录的 Cloud Function `cloud-functions/api/ps-ai.js` 提供，对应同域路径 `/api/ps-ai`。EdgeOne 构建时须包含仓库根目录的云函数与 `lib/ps-ai-proxy.mjs`，不能只上传静态的 public 目录。通过 GitHub 导入此仓库的项目会随提交一起部署；本地使用 `node start-preview.cjs` 的预览服务也提供同一接口。

默认仅允许转发 `openaiapi.cc`。如需添加其他可信平台，在 EdgeOne 项目的云函数环境变量中设置 `PS_AI_ALLOWED_HOSTS`，值为英文逗号分隔的完整域名，例如 `openaiapi.cc,api.deepseek.com,api.openai.com`；设置后会替代默认列表。域名不能包含协议、端口、路径、通配符或 IP 地址。修改环境变量后重新部署。

服务器无需配置用户的 API Key。Key 由当前请求携带，只发送到白名单内的 HTTPS AI 接口；代码不记录或持久化 Key、对话、参考图及生成结果。接口只转发模型列表、Chat / Responses、Images 和 Gemini 的常用路径，不接受任意网页地址、跳转或站外来源请求。云函数的请求与响应均受平台的 6 MB 上限约束。请求超限时，本站会提示缩小参考图、开始新对话或使用平台直连；生成结果过大时也可能超过平台响应限制。转发等待上限为 110 秒，edgeone.json 中已将云函数最大执行时长设为 120 秒。

当前中转站可分别新增两份配置：操控使用 Chat API 与模型 `gpt-5.5`；生图使用 Images API 与模型 `gpt-image-1`。根地址均为 `https://openaiapi.cc/v1`，分别填入用户自己的 Key，均勾选转发。是否支持其他模型及图像编辑，以平台实际返回为准。
