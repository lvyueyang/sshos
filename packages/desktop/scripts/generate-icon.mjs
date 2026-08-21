/**
 * 应用图标生成器（打包资源）：纯 Node 零依赖绘制 1024x1024 RGBA PNG。
 * 图形为「终端窗口 + 状态灯」隐喻：深色圆角窗口内三颗红黄绿标题灯与绿色命令提示符。
 * 输出 packages/desktop/build/icon.png，electron-builder 据此生成 .icns/.ico。
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;
const buf = Buffer.alloc(SIZE * SIZE * 4, 0);

/** 写一个像素（预乘无关，直接 RGBA 覆盖） */
function px(x, y, [r, g, b, a]) {
	if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
	const i = (y * SIZE + x) * 4;
	buf[i] = r;
	buf[i + 1] = g;
	buf[i + 2] = b;
	buf[i + 3] = a;
}

/** 抗锯齿圆角矩形填充（逐像素 SDF 判断） */
function roundRect(x0, y0, x1, y1, radius, color) {
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			// 圆角区域用 SDF 计算 alpha 抗锯齿
			const cx = Math.max(x0 + radius, Math.min(x, x1 - radius));
			const cy = Math.max(y0 + radius, Math.min(y, y1 - radius));
			const dist = Math.hypot(x - cx, y - cy);
			const corner = x < x0 + radius || x > x1 - radius;
			const inRect = dist <= radius || !corner;
			if (inRect) px(x, y, color);
		}
	}
}

/** 实心矩形 */
function rect(x0, y0, x1, y1, color) {
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, color);
}

/** 实心圆 */
function circle(cx, cy, r, color) {
	for (let y = cy - r; y <= cy + r; y++) {
		for (let x = cx - r; x <= cx + r; x++) {
			if (Math.hypot(x - cx, y - cy) <= r) px(x, y, color);
		}
	}
}

/** 实心三角形（扫描线填充） */
function triangle(p1, p2, p3, color) {
	const minY = Math.min(p1[1], p2[1], p3[1]);
	const maxY = Math.max(p1[1], p2[1], p3[1]);
	for (let y = minY; y <= maxY; y++) {
		const xs = [];
		const pts = [p1, p2, p3, p1];
		for (let i = 0; i < 3; i++) {
			const [ax, ay] = pts[i];
			const [bx, by] = pts[i + 1];
			if (ay === by) continue;
			if ((ay <= y && by > y) || (by <= y && ay > y)) {
				xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
			}
		}
		if (xs.length === 2) {
			const [a, b] = xs.sort((m, n) => m - n);
			for (let x = Math.ceil(a); x <= Math.floor(b); x++) px(x, y, color);
		}
	}
}

// ── 绘制 ──
// 图标基底：全幅深色圆角方块（macOS 圆角由系统裁剪，Windows/Linux 保留直角）
roundRect(0, 0, SIZE - 1, SIZE - 1, 180, [13, 17, 23, 255]);
// 终端窗口：深灰圆角窗体
roundRect(150, 260, 874, 764, 40, [22, 27, 34, 255]);
rect(150, 260, 874, 318, [22, 27, 34, 255]);
// 标题栏三颗状态灯（红/黄/绿）
circle(252, 289, 24, [255, 99, 99, 255]);
circle(322, 289, 24, [255, 208, 82, 255]);
circle(392, 289, 24, [62, 200, 138, 255]);
// 命令提示符：绿色「>」与下划线光标
triangle([270, 600], [330, 560], [330, 640], [62, 200, 138, 255]);
rect(378, 596, 690, 604, [62, 200, 138, 255]);
rect(378, 636, 560, 644, [62, 200, 138, 255]);
// 输出行占位（浅灰短条）
rect(378, 480, 560, 488, [48, 54, 61, 255]);
rect(378, 520, 640, 528, [48, 54, 61, 255]);

// ── PNG 编码（RGBA8 + 每行 filter 0 + zlib）──
function crc32(data) {
	let c;
	const table = crc32.table || (crc32.table = (() => {
		const t = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			t[n] = c >>> 0;
		}
		return t;
	})());
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, payload) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(payload.length);
	const typeBuf = Buffer.from(type, "ascii");
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, payload])));
	return Buffer.concat([len, typeBuf, payload, crcBuf]);
}

// 每行前导 filter byte 0（None）
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
	buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	chunk("IHDR", ihdr),
	chunk("IDAT", deflateSync(raw, { level: 9 })),
	chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "../build/icon.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`icon.png 生成: ${out} (${png.length} bytes)`);
