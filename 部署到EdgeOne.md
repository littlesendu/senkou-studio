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

在正式网址后添加 /admin/ 进入后台。连接自己的 GitHub 仓库和生产分支，访问令牌需要这个仓库的 Contents 读写权限；审核客户评价还需要 Issues 读写权限。令牌仅在当前页面内存中使用，不要上传到仓库。

保存内容会生成一次 GitHub 提交，EdgeOne 自动构建完成后，访客才能看到更新。

目前客户投递评价仍需要登录 GitHub。托管迁移不会改变这一点；要让访客直接匿名投递，需要另接评价服务。

## 常见问题

- 提示 Failed to switch to Node.js：先确认部署使用最新的 main 提交，且仓库不含旧的 .nvmrc；edgeone.json 应指定平台预装的 nodeVersion 24.18.0。

- 提示找不到 package.json：检查是否把最外层上传文件夹也一起传入，导致仓库多套了一层目录。
- 提示找不到 Hexo 或 js-yaml：确认安装命令包含 --include=dev。
- 部署后 404：确认输出目录完整填写 work/deploy-site/public。
- 修改环境变量后仍显示旧内容：环境变量只影响新的构建，需要重新部署。
- 后台保存后网站未变化：检查保存分支是否与 EdgeOne 生产分支相同，以及最新部署是否成功。

这是 2026-10-19 整理的首次上传副本。后续以 GitHub 仓库及原项目中的最新文件为准。
