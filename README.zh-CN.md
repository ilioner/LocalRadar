# LocalRadar

[English](./README.md)

LocalRadar 是一个跨平台桌面应用，用来发现本机服务、管理 localhost 端口、跟踪 Docker 服务变化，并把这些服务整理成一个适合开发者使用的本地服务目录。

它适合这样的场景：

- 你本机经常同时跑很多 Docker 容器、本地 Web 服务、数据库、AI 推理服务
- 你总是忘记某个端口到底属于哪个服务
- 你想知道刚刚新增了什么服务、消失了什么服务
- 你希望从一个桌面界面里查看服务、打开地址、搜索端口、查看进程信息

关键词：

- 本地服务发现
- localhost 端口管理
- Docker 服务监控
- 本机服务导航
- 开发者桌面工具
- Tauri 桌面应用
- Rust React 桌面应用

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-2f7df6)
![Tauri](https://img.shields.io/badge/Tauri-2.x-24c8db)
![Rust](https://img.shields.io/badge/Rust-stable-f0743e)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![License](https://img.shields.io/badge/license-MIT-green)

## 预览

![LocalRadar overview](./docs/preview-overview.svg)

## 它能解决什么问题

本地开发环境很容易变得混乱。一个开发者工作站上，可能同时运行：

- Docker 容器
- Node.js / Vite / Next.js 开发服务
- Python / FastAPI / Flask / Uvicorn 服务
- PostgreSQL / Redis / MySQL 等数据库
- Ollama 等 AI 本地运行时

LocalRadar 的目标就是把这些服务重新组织起来，让你快速回答：

- 现在本机到底跑了哪些服务？
- `localhost:3000`、`localhost:5173`、`localhost:11434` 分别是谁？
- 哪些服务是刚启动的？
- 某个服务对应的 PID、目录、可执行文件在哪里？

## 当前功能

- 发现 Docker 端口映射
- 发现本机监听中的服务
- 跟踪服务新增、删除与变更
- 按名称、端口、URL、标签、路径搜索服务
- 展示 PID、CPU、内存、可执行文件路径、工作目录等信息
- 在检查器中展示轻量级 CPU / 内存趋势图
- 收藏、重命名、隐藏与恢复服务
- 按来源或分类筛选服务
- 支持中英文界面
- 基于 Tauri 的原生桌面应用形态

## 典型用途

- 统一查看 Docker 服务和本机服务
- 查找某个端口到底属于哪个应用
- 在大量同名进程里快速定位真正想找的服务
- 把本地开发环境整理成一个可搜索的服务目录
- 为 AI、本地开发和 homelab 风格工作流提供服务导航能力

## 技术栈

- `Tauri 2`
- `Rust`
- `React`
- `TypeScript`
- `Vite`

## 项目结构

- `app/`: React 前端界面
- `src-tauri/`: Tauri 桌面壳与运行时状态管理
- `crates/core/`: Rust 服务发现逻辑与共享数据模型

## 本地开发

### 环境要求

- Rust 工具链
- Node.js 与 npm
- 当前平台所需的 Tauri 依赖
- 如果需要 Docker 发现能力，需要安装 `docker`
- Unix-like 系统下，本机监听端口发现依赖 `lsof`

### 安装依赖

```bash
cd app
npm install
```

### 启动桌面应用

在项目根目录执行：

```bash
./app/node_modules/.bin/tauri dev
```

### 构建前端

```bash
cd app
npm run build
```

### 检查 Rust 代码

```bash
cargo check
```

## 打包

如果你想在本地构建桌面安装包，可以执行：

```bash
./app/node_modules/.bin/tauri build
```

最终产物格式取决于当前平台以及 Tauri 打包依赖是否齐全。

## 当前限制

- 资源占用是基于扫描周期采样的，不是系统监视器级别的高频实时流
- 本机监听服务发现目前主要面向 Unix-like 环境
- 还没有接入 SQLite 做持久化
- 还没有配置自动发布流水线

## 自动发布说明

当前仓库已经补上了 GitHub Actions 自动打包工作流。

当前规则：

- 推送版本标签，例如 `v0.1.0`
- 或者在 GitHub Actions 页面手动触发
- 工作流会自动构建 macOS、Windows、Linux 的桌面产物
- 构建完成后会把安装包挂到 GitHub Release

工作流文件：

- `.github/workflows/release.yml`

补充说明：

- 目前还没有配置 macOS / Windows 签名
- 现阶段更适合测试、内部使用或先验证自动打包链路

## Roadmap

- 增加 SQLite 持久化能力
- 继续优化相似服务名的分类和识别
- 配置自动打包与发布流水线
- 扩展 Docker 与 localhost 之外的服务发现能力

## 许可证

MIT，见 [LICENSE](./LICENSE)。
