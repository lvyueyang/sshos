/**
 * i18next 初始化（决策记录 D14）：默认 zh-CN，UI 文案集中管理
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./locales/zh-CN";

const DEFAULT_NS = "translation";

void i18n.use(initReactI18next).init({
	resources: {
		"zh-CN": { [DEFAULT_NS]: zhCN },
	},
	lng: "zh-CN",
	fallbackLng: "zh-CN",
	defaultNS: DEFAULT_NS,
	interpolation: { escapeValue: false },
});

export default i18n;
