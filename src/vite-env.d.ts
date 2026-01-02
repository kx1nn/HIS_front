/// <reference types="vite/client" />

// 环境变量类型声明
interface ImportMetaEnv {
    /** API 基础路径 */
    readonly VITE_API_BASE: string;
    /** 后端服务地址（用于代理） */
    readonly VITE_API_TARGET: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
