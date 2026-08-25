/**
 * 终端命令追踪器（docs 界面设计 §8.6，借鉴 electerm 思路）：
 * 从 onData 输入流累积当前命令行，回车时回调完整命令（客户端记录 terminal_command 类审计）。
 * 结合 PTY 输出检测密码提示（[sudo] password / Password: / 密码），密码输入行不落审计；
 * 密码提示要求「冒号后仅剩空白/换行」且位于输出尾部——提示符总是最后打印，命令输出里的
 * `"password": "xxx"` 等文本不再误触发。
 * 转义序列为跨 chunk 状态机（ESC/CSI/OSC 跨 onData 分片也能正确跳过）。
 * 已知局限：经 readline 光标移动编辑的行按「输入字符顺序」记录，而非最终成行文本。
 */

/** 密码提示正则（strip ANSI 后匹配输出尾部；冒号后仅剩空白/换行才视为提示符） */
const PASSWORD_PROMPT =
	/password[^\r\n:：]{0,40}[:：]\s*$|密码[^\r\n:：]{0,10}[:：]\s*$/i;
/** 仅检测输出尾部（提示符总是出现在最近输出），长度上限 */
const OUTPUT_TAIL_MAX = 300;
/** ESC 字符（控制字符不可直接写进正则字面量，运行时拼接） */
const ESC = "\x1b";
/** CSI 控制序列（去 ANSI 用） */
const ANSI_CSI = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "g");

export interface CommandTracker {
	/** 消费一段 PTY 输出，检测密码提示（用于抑制密码行落库） */
	consumeOutput(text: string): void;
	/** 消费一段终端输入（onData），回车时回调完整命令 */
	handleInput(data: string): void;
}

/** 创建命令追踪器：emit 在回车且命令非空时回调（密码提示后的输入行已被抑制） */
export function createCommandTracker(
	emit: (command: string) => void,
): CommandTracker {
	let line = "";
	// 转义序列状态机（跨 handleInput 调用保持）：0=普通 1=ESC 2=CSI 3=OSC
	let escState: 0 | 1 | 2 | 3 = 0;
	let expectingPassword = false;
	let outputTail = "";

	const flushLine = () => {
		const cmd = line.trim();
		line = "";
		if (!cmd) return;
		// 密码提示后的输入是密码，不落审计
		if (expectingPassword) {
			expectingPassword = false;
			return;
		}
		emit(cmd);
	};

	return {
		consumeOutput(text) {
			if (expectingPassword) return;
			outputTail = `${outputTail}${text}`.slice(-OUTPUT_TAIL_MAX);
			const clean = outputTail.replace(ANSI_CSI, "");
			if (PASSWORD_PROMPT.test(clean)) expectingPassword = true;
		},
		handleInput(data) {
			let i = 0;
			while (i < data.length) {
				const ch = data[i];
				const code = ch.charCodeAt(0);

				// 转义序列状态机（跨 chunk 保持）：先处理续接状态
				if (escState === 1) {
					// 上一个 chunk 以 ESC 结尾，等待判断是 CSI/OSC 还是独立 ESC 键
					if (ch === "[") {
						escState = 2;
						i++;
						continue;
					}
					if (ch === "]") {
						escState = 3;
						i++;
						continue;
					}
					// 独立 ESC 键：shell 取消当前输入，该字符走普通处理
					escState = 0;
					line = "";
					continue; // 不 i++，让该字符进入普通分支
				}
				if (escState === 2) {
					// CSI：消费到终结字节（0x40-0x7E）
					if (code >= 0x40 && code <= 0x7e) escState = 0;
					i++;
					continue;
				}
				if (escState === 3) {
					// OSC：消费到 BEL 或 ST（ESC \）
					if (ch === "\x07") {
						escState = 0;
					} else if (ch === "\x1b" && data[i + 1] === "\\") {
						escState = 0;
						i++;
					} else if (ch === "\x1b") {
						escState = 1;
					}
					i++;
					continue;
				}

				if (ch === "\x1b") {
					const next = data[i + 1];
					if (next === "[") {
						escState = 2; // CSI
						i += 2;
						continue;
					}
					if (next === "]") {
						escState = 3; // OSC
						i += 2;
						continue;
					}
					if (next !== undefined && next.charCodeAt(0) >= 32) {
						// Alt+按键：Meta 绑定不插入字符，保留现有行
						i += 2;
						continue;
					}
					if (next === undefined) {
						// ESC 是 chunk 末尾：保留状态，等待下一 chunk（可能是跨 chunk 转义序列）
						escState = 1;
						i++;
						continue;
					}
					// ESC 后跟控制字符（同 chunk）：独立 ESC 键清行，控制字符走普通处理
					line = "";
					escState = 0;
					i++;
					continue;
				}

				if (ch === "\x03") {
					// Ctrl-C：取消当前输入并结束密码等待（密码提示处中断后恢复正常记录）
					line = "";
					expectingPassword = false;
					i++;
					continue;
				}
				if (ch === "\r" || ch === "\n") {
					flushLine();
					i++;
					continue;
				}
				if (ch === "\x7f") {
					line = line.slice(0, -1); // 退格
					i++;
					continue;
				}
				if (ch === "\x15") {
					line = ""; // Ctrl-U 清行
					i++;
					continue;
				}
				if (ch === "\x17") {
					line = line.replace(/\S+\s*$/, ""); // Ctrl-W 删词
					i++;
					continue;
				}
				if (code < 32) {
					i++; // 其余控制字符忽略
					continue;
				}
				line += ch;
				i++;
			}
		},
	};
}
