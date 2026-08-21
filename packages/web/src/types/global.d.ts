/**
 * 渲染层全局类型声明：window.sshOS 由 Electron preload 注入（决策记录 D19）。
 * 纯浏览器 dev 模式（pnpm dev:web）无 preload，字段可为 undefined。
 */

interface Window {
	sshOS?: {
		platform: string;
		authToken?: string;
	};
}
