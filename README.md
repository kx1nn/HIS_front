# HIS 智慧医疗系统 (前端)

## 📂 目录结构说明

src/
├── 📂 types/ # [定义] 字典层 (TypeScript 类型定义)
│ └── index.ts # 核心业务类型：Patient, Doctor, PrescriptionVO 等
│
├── 📂 store/ # [大脑] 记忆层 (Zustand 状态管理)
│ └── store.ts # 全局状态：当前用户、Token、通知消息、医生列表
│
├── 📂 services/ # [联络] 通讯层 (Axios API 封装)
│ └── api.ts # 统一管理所有后端接口与错误拦截
│
├── 📂 components/ # [零件] 公共组件
│ ├── 🛡️ PrivateRoute.tsx # 路由守卫 (检查登录状态)
│ └── 🔔 ToastContainer.tsx # 全局通知显示组件
│
├── 📂 pages/ # [界面] 视图层 (各业务子系统)
│ ├── 📂 Login/ # 登录页
│ ├── 📂 DoctorStation/ # 医生工作台 (接诊、写病历)
│ ├── 📂 NurseStation/ # 护士工作站 (挂号、患者列表)
│ ├── 📂 PharmacyStation/ # 药房工作台 (发药、库存)
│ └── 📂 Admin/ # 后台管理
│
├── ⚛️ App.tsx # [路标] 路由配置 (Router)
├── ⚛️ main.tsx # [入口] 程序启动与挂载
└── 🎨 index.css # [装修] 全局样式 (Tailwind CSS)

## 当前说明

此仓库为 HIS 前端，采用 React + TypeScript + Vite，主要职责为与后端 API 对接并提供医生/护士/药房等工作台视图。

### 快速命令

- 安装依赖: `npm install`
- 本地开发: `npm run dev`
- 构建: `npm run build`
- 代码检查: `npm run lint`
- 类型检查: `npx tsc -b --noEmit`

### 环境变量

- `VITE_API_BASE`：后端基准地址。未设置时默认 `/api`。

### 注意事项与当前状态

- 登录后 token 存储在 `localStorage`（键 `his_token`），由 `api.ts` 拦截器注入 Authorization 头。
- 错误处理：服务层使用 `logApiError` 统一记录；页面层决定是否展示 `notify` 给用户。
