import { describe, expect, it } from "vitest";

import { detectLang } from "./script";

describe("detectLang", () => {
	it("names Devanagari as Hindi", () => {
		expect(detectLang("फिर ले आया दिल मजबूर क्या कीजे")).toBe("hi");
	});

	it("leaves Latin alone rather than guessing between languages", () => {
		expect(
			detectLang("Daylight, I wake up feeling like you won't play right"),
		).toBeNull();
		expect(detectLang("Corre, corre, corazón")).toBeNull();
	});

	it("settles Japanese on kana even when Han is present", () => {
		expect(detectLang("君の名前を呼ぶ")).toBe("ja");
	});

	it("reads Han without kana as Chinese", () => {
		expect(detectLang("月亮代表我的心")).toBe("zh");
	});

	it("ignores a borrowed word too small to change the page", () => {
		const mostlyLatin = `${"english lyrics here ".repeat(20)}नमस्ते`;
		expect(detectLang(mostlyLatin)).toBeNull();
	});

	it("still calls it when a script carries a real share of the text", () => {
		expect(detectLang("इश्क़ ishq इश्क़ इश्क़")).toBe("hi");
	});

	it("returns null for text with no letters at all", () => {
		expect(detectLang("—  ...  (2024)  [12:34]")).toBeNull();
		expect(detectLang("")).toBeNull();
	});

	it("handles the other scripts the catalogue reaches", () => {
		expect(detectLang("나는 너를 사랑해")).toBe("ko");
		expect(detectLang("أنا أحبك")).toBe("ar");
		expect(detectLang("Я тебя люблю")).toBe("ru");
		expect(detectLang("ฉันรักเธอ")).toBe("th");
	});
});
