/**
 * 公开 SFn 注册表：标记登录前可访问的 SFn（如 setup / login / status）。
 * SFn 请求路径为 /_serverFn/{functionId}，functionId 是内容哈希（不可按前缀识别），
 * 故由 SFn 定义处注册其 .url 到集合；集合挂 globalThis 规避 Nitro 打包 chunk 分裂。
 */

const GLOBAL_KEY = "__SSHOS_PUBLIC_SFN_URLS__";

function getSet(): Set<string> {
	const g = globalThis as Record<string, unknown>;
	if (!g[GLOBAL_KEY] || !(g[GLOBAL_KEY] instanceof Set)) {
		g[GLOBAL_KEY] = new Set<string>();
	}
	return g[GLOBAL_KEY] as Set<string>;
}

/** 注册公开 SFn（createServerFn 返回对象的 .url = /_serverFn/{id}） */
export function registerPublicSfn(url: string): void {
	getSet().add(url);
}

/** 判断 pathname 是否为公开 SFn（鉴权中间件豁免用） */
export function isPublicSfn(pathname: string): boolean {
	return getSet().has(pathname);
}
