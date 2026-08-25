/**
 * bootstrap 状态（纯模块，零服务端依赖）：
 * 供 /api/bootstrap/status 与鉴权中间件查询；变更由 bootstrap.ts 驱动。
 * 状态挂 globalThis 而非模块级变量——避免 Nitro 打包时该模块被拆到多个 chunk
 * 导致 bootstrap（server 入口链）与路由/中间件各自持有一份状态的实例分裂。
 */

const GLOBAL_KEY = "__SSHOS_BOOTSTRAP__";

interface BootstrapState {
	phase: "running" | "ready";
	/** 当前初始化步骤（migrations / seed），供载入界面展示 */
	step: string | null;
}

function getState(): BootstrapState {
	const g = globalThis as Record<string, unknown>;
	if (!g[GLOBAL_KEY]) {
		g[GLOBAL_KEY] = { phase: "running", step: null } satisfies BootstrapState;
	}
	return g[GLOBAL_KEY] as BootstrapState;
}

/** 查询初始化状态 */
export function getBootstrapStatus(): BootstrapState {
	const { phase, step } = getState();
	return { phase, step };
}

/** 标记进入某初始化步骤（仅 bootstrap.ts 调用） */
export function setBootstrapRunning(nextStep: string): void {
	const state = getState();
	state.phase = "running";
	state.step = nextStep;
}

/** 标记初始化完成（仅 bootstrap.ts 调用） */
export function setBootstrapReady(): void {
	const state = getState();
	state.phase = "ready";
	state.step = null;
}
