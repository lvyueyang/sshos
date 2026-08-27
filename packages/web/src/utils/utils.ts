/**
 * 通用工具：cn() 合并 className（clsx + tailwind-merge），shadcn 组件统一依赖
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 className：支持条件/数组入参，并去重冲突的 Tailwind 类 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
