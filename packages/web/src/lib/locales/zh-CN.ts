/**
 * 简体中文本地化资源（默认语言包）
 */

export default {
	app: {
		name: "SSH OS",
		tagline: "远程 Linux 桌面外壳",
	},
	common: {
		cancel: "取消",
		save: "保存",
		confirm: "确定",
		delete: "删除",
		edit: "编辑",
		refresh: "刷新",
		close: "关闭",
		search: "搜索",
	},
	sidebar: {
		bookmarks: "书签",
		history: "历史",
		newConnection: "新建连接",
		settings: "设置",
		addFirstConnection: "添加你的第一个连接",
		supportsAuth: "支持密钥和密码认证",
		start: "开始配置",
		emptyGroup: "（无分组）",
	},
	tab: {
		closeOthers: "关闭其他",
		closeRight: "关闭右侧",
		copyConnectionInfo: "复制连接信息",
	},
	connection: {
		online: "在线",
		offline: "离线",
		connecting: "连接中",
		error: "异常",
		connect: "连接",
		copy: "复制连接",
		moveToGroup: "移动到分组",
		deleteConfirm: "确定删除该连接？",
	},
	window: {
		minimize: "最小化",
		maximize: "最大化",
		restore: "还原",
	},
} as const;
