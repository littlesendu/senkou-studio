# 森口电竞

三角洲护航、娱乐与陪玩工作室的网站和工作室手记。

2025 年 5 月提出构想，2026 年 9 月正式成立。三人小队：森口电竞sendu、创始人森口电竞椰伦苏、森口电竞尘埃。

## 网站内容

- 工作室介绍、服务说明与三位成员。
- 水面光标效果、双向滚动渐入和手记翻页动画。
- 漂流瓶客户评价，以及随公开评价变化的成员星级。
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

## 开源说明

本项目基于 ZenithSeraph 的 hexo-theme-welkin 修改。原项目采用 MIT 许可证，见 [LICENSE](./LICENSE)；其他依赖与素材声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
