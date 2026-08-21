/**
 * 生产构建后置处理（web build 串联）：
 * 1. 复制 drizzle 迁移目录 → .output/drizzle（打包后 server 的 runMigrations 读取，见 docs/02 §4.7）
 * 2. 将 external 的运行时依赖（ssh2 / @earendil-works/pi-coding-agent）及其传递闭包
 *    复制到 .output/server/node_modules —— 打包后 Nitro server 以裸导入解析它们，
 *    产物本身不打包这两个包（ssh2 CJS 打包挂 / pi 打包挂起，见 vite.config external）。
 */

import { createRequire } from "node:module";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const srcNodeModules = join(webRoot, "node_modules");
const outServerDir = join(webRoot, ".output", "server");
const require = createRequire(import.meta.url);

// 1) 迁移目录分发
const drizzleSrc = join(webRoot, "drizzle");
const drizzleOut = join(webRoot, ".output", "drizzle");
rmSync(drizzleOut, { recursive: true, force: true });
cpSync(drizzleSrc, drizzleOut, { recursive: true });

// 2) external 运行时依赖闭包分发
/** 沿目录向上查找 node_modules/<name>（对齐 Node 解析算法；处理 exports 受限包） */
function findUp(name, startDir) {
	let d = startDir;
	for (let i = 0; i < 16; i++) {
		const candidate = join(d, "node_modules", name);
		if (existsSync(join(candidate, "package.json"))) return candidate;
		const parent = dirname(d);
		if (parent === d) break;
		d = parent;
	}
	return null;
}

/** 解析包根目录（返回 realpath）：优先 require.resolve；exports 受限包走 findUp */
function resolveRoot(name, base) {
	let dir = null;
	try {
		const entry = require.resolve(name, { paths: [base] });
		let d = dirname(entry);
		for (let i = 0; i < 12; i++) {
			const pj = join(d, "package.json");
			// 包根需含 name 字段；子目录的 `{"type":"commonjs"}` 模块标记（如 minimatch/dist/commonjs）不算
			if (existsSync(pj)) {
				try {
					if (JSON.parse(readFileSync(pj, "utf8")).name) {
						dir = d;
						break;
					}
				} catch {
					// 非法 package.json，继续上溯
				}
			}
			d = dirname(d);
		}
	} catch {
		dir = null;
	}
	// require.resolve 对 exports 受限包抛 ERR_PACKAGE_PATH_NOT_EXPORTED，改走目录上溯
	if (!dir) dir = findUp(name, base);
	if (!dir) return null;
	// 解引用 pnpm symlink，确保子依赖从真实 .pnpm 目录解析
	return realpathSync(dir);
}

/**
 * 收集 external 包的传递依赖闭包（含 optionalDependencies，未安装的解析失败即跳过）。
 * 每个依赖必须从其父包的真实目录解析（pnpm 布局下子依赖不挂在包顶层 node_modules）。
 */
function collectClosure(roots) {
	const seen = new Map();
	const queue = roots.map((name) => ({ name, base: srcNodeModules }));
	while (queue.length) {
		const { name, base } = queue.shift();
		if (seen.has(name)) continue;
		const dir = resolveRoot(name, base);
		if (!dir) {
			console.warn(`[prepare-server] 未解析到依赖（跳过）: ${name}`);
			continue;
		}
		seen.set(name, dir);
		const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		for (const dep of Object.keys({
			...pkg.dependencies,
			...pkg.optionalDependencies,
		})) {
			queue.push({ name: dep, base: dir });
		}
	}
	return seen;
}

const outNodeModules = join(outServerDir, "node_modules");
rmSync(outNodeModules, { recursive: true, force: true });
mkdirSync(outNodeModules, { recursive: true });

let copied = 0;
for (const [name, dir] of collectClosure([
	"ssh2",
	"@earendil-works/pi-coding-agent",
])) {
	const target = join(outNodeModules, name);
	if (existsSync(target)) {
		console.warn(`[prepare-server] 依赖版本冲突保留首个: ${name}`);
		continue;
	}
	mkdirSync(dirname(target), { recursive: true });
	cpSync(dir, target, { recursive: true, dereference: true });
	copied++;
}

console.log(
	`[prepare-server] 完成：drizzle → .output/drizzle；${copied} 个运行时依赖包 → .output/server/node_modules`,
);
