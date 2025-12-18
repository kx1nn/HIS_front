# HIS 智慧医疗系统 (前端)

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

启动后访问终端显示的地址（通常是 `http://localhost:5173`）。

### 3. 测试账号

- **护士站**: 账号 `nurse` / 密码任意
- **医生站**: 账号 `doctor` / 密码任意
- **管理员**: 账号 `admin` / 密码任意

## 🔌 后端对接说明

目前项目使用 **纯前端 Mock 数据** 模式，所有数据存储在内存中，刷新页面会重置。

### 如何连接真实后端？

1. **修改 API 地址**
   打开 `src/services/api.ts`，修改 `API_BASE_URL`：

   ```typescript
   // src/services/api.ts
   const API_BASE_URL = "http://localhost:8080/api"; // 你的后端地址
   ```

2. **替换 Mock 逻辑**
   在 `src/services/api.ts` 中，将模拟数据的代码替换为真实的 Axios 请求。

   **示例：提交挂号**

   ```typescript
   // 修改前 (Mock)
   create: async (data) => {
     // ...模拟代码...
     return { success: true, data: newReg };
   };

   // 修改后 (真实请求)
   create: async (data) => {
     try {
       const res = await api.post("/registration/create", data);
       return res.data; // 假设后端返回 { success: true, data: ... }
     } catch (error) {
       return { success: false, message: "网络请求失败" };
     }
   };
   ```

3. **解决跨域问题 (CORS)**
   如果前后端不在同一个端口（例如前端 5173，后端 8080），需要在 **后端** 配置 CORS 允许跨域，或者在 `vite.config.ts` 中配置代理：
   ```typescript
   // vite.config.ts
   export default defineConfig({
     server: {
       proxy: {
         "/api": {
           target: "http://localhost:8080",
           changeOrigin: true,
           rewrite: (path) => path.replace(/^\/api/, ""),
         },
       },
     },
     // ...
   });
   ```

## 📂 目录结构说明

```text
src/
├── 📂 types/           # [定义] 字典层
│   └── index.ts        # 规定了“患者”、“医生”的数据长什么样 (TypeScript 类型)
│
├── 📂 store/           # [大脑] 记忆层
│   └── store.ts        # 存着“当前登录用户”、“医生列表”这些全局数据 (Zustand)
│
├── 📂 services/        # [联络] 通讯层
│   └── api.ts          # 专门负责跟后端服务器发请求、拿数据 (Axios)
│
├── 📂 pages/           # [界面] 视图层 (用户看到的页面)
│   ├── 📂 Login/       # 登录页文件夹
│   │   └── index.tsx   # 登录页的具体代码
│   └── 📂 NurseStation/# 护士工作台文件夹
│       └── index.tsx   # 护士站的具体代码
│
├── ⚛️ App.tsx          # [路标] 路由配置 (决定输入网址后跳到哪个 Page)
├── ⚛️ main.tsx         # [入口] 程序启动的地方 (把 App 挂载到 HTML 上)
└── 🎨 index.css        # [装修] 全局样式 (Tailwind 配置)
```
