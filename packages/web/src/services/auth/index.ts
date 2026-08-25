/**
 * 认证服务出口：server.json 配置、启动密码、JWT 的统一入口。
 * setup / login / status 三个 Server Route 与全局鉴权中间件共用。
 */

export * from "./config";
export * from "./jwt";
export * from "./password";
