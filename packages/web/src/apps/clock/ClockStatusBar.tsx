/**
 * 时钟状态栏（docs 界面设计 §3.5 / docs 05 §4）：statusbar surface 应用内容，
 * 组件内每秒刷新当前时间，常驻任务栏右侧槽位。
 */

import { useEffect, useState } from "react";

/** 状态栏时钟：每秒刷新，样式走 muted-foreground token（docs/07 §2） */
export function ClockStatusBar() {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 1_000);
		return () => clearInterval(timer);
	}, []);

	return (
		<span className="whitespace-nowrap text-xs text-muted-foreground">
			{now.toLocaleTimeString("zh-CN", { hour12: false })}
		</span>
	);
}
