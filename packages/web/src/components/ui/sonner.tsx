/**
 * 全局 toast（sonner 封装）：图标用 Remix（docs/07 §4），主题跟随自研 theme store（docs/06 §4）。
 * 由根路由挂载 <Toaster />，业务侧直接 import { toast } from "sonner" 使用。
 */

import {
	RiAlertLine,
	RiCheckboxCircleLine,
	RiCloseCircleLine,
	RiInformationLine,
	RiLoader4Line,
} from "@remixicon/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useThemeStore } from "#/stores/theme";

const Toaster = ({ ...props }: ToasterProps) => {
	const scheme = useThemeStore((s) => s.scheme);

	return (
		<Sonner
			theme={scheme}
			className="toaster group"
			icons={{
				success: <RiCheckboxCircleLine className="size-4" />,
				info: <RiInformationLine className="size-4" />,
				warning: <RiAlertLine className="size-4" />,
				error: <RiCloseCircleLine className="size-4" />,
				loading: <RiLoader4Line className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
