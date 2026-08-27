/**
 * 认证服务出口：server.json 配置、启动密码、JWT 的统一入口。
 * setup / login / status 三个 Server Route 与全局鉴权中间件共用。
 */

export * from "./core/config";
export * from "./core/jwt";
export * from "./core/password";
