import React from "react";

type Create = typeof React.createElement;

/** 宿主没有数字框。令牌对齐单行 Input，不桥接成 Ant InputNumber。 */
export function NumberField(props: {
	min?: number;
	max?: number;
	value: number | null;
	disabled?: boolean;
	"aria-label"?: string;
	onChange(value: number | null): void;
}) {
	return React.createElement("input", {
		className: "dsham_number",
		type: "number",
		min: props.min,
		max: props.max,
		value: props.value ?? "",
		disabled: props.disabled,
		"aria-label": props["aria-label"],
		onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
			const raw = event.target.value;
			if (raw === "") { props.onChange(null); return; }
			const next = Number(raw);
			props.onChange(Number.isNaN(next) ? null : next);
		},
	});
}

/** 宿主没有日期范围。两个原生日期框，值仍是 YYYY-MM-DD。 */
export function DateRange(props: {
	from: string;
	to: string;
	label: string;
	fromLabel: string;
	toLabel: string;
	invalid?: boolean;
	onFrom(value: string): void;
	onTo(value: string): void;
	onClear(): void;
}) {
	function change(which: "from" | "to", value: string) {
		const nextFrom = which === "from" ? value : props.from;
		const nextTo = which === "to" ? value : props.to;
		if (nextFrom === "" && nextTo === "") { props.onClear(); return; }
		if (which === "from") props.onFrom(value);
		else props.onTo(value);
	}
	return React.createElement("div", { className: "dsham_dateRange", role: "group", "aria-label": props.label },
		React.createElement("input", { className: "dsham_date", type: "date", value: props.from, "aria-label": props.fromLabel, "aria-invalid": props.invalid || undefined, onChange: (event: React.ChangeEvent<HTMLInputElement>) => change("from", event.target.value) }),
		React.createElement("span", { className: "dsham_dateSep", "aria-hidden": true, children: "–" }),
		React.createElement("input", { className: "dsham_date", type: "date", value: props.to, "aria-label": props.toLabel, "aria-invalid": props.invalid || undefined, onChange: (event: React.ChangeEvent<HTMLInputElement>) => change("to", event.target.value) }),
		(props.from || props.to) ? React.createElement("button", { type: "button", className: "dsham_dateClearBtn", "aria-label": "clear", title: "clear", onClick: props.onClear, children: "×" }) : null
	);
}

/** 失败详情用受控按钮加区域，不使用 Ant Collapse。 */
export function Disclosure(props: { title: React.ReactNode; open: boolean; onToggle(): void; className?: string; children?: React.ReactNode }) {
	return React.createElement("div", { className: props.className },
		React.createElement("button", { type: "button", className: "dsham_disclosure", "aria-expanded": props.open, onClick: props.onToggle },
			foldChevron(React.createElement, props.open),
			props.title),
		props.open ? React.createElement("div", null, props.children) : null);
}

/** 折叠箭头。方向由 aria-expanded 决定，不靠动画结束才算展开。 */
export function foldChevron(h: Create, open: boolean) {
	return h("svg", {
		className: "dsham_foldChevron" + (open ? " is-open" : ""),
		viewBox: "0 0 16 16",
		width: 12,
		height: 12,
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.5,
		"aria-hidden": true,
	}, h("path", { d: "M4 6l4 4 4-4", strokeLinecap: "round", strokeLinejoin: "round" }));
}

/**
 * 行内选择框需要半选。宿主 Checkbox 会画出可见标签，也不接收 indeterminate。
 * 标签由调用方放在旁边，这里只画 16px 原生框。
 */
export function SelectionCheckbox(props: {
	checked: boolean;
	indeterminate?: boolean;
	disabled?: boolean;
	label: string;
	onChange: (event: { target: { checked: boolean } }) => void;
}) {
	const ref = React.useRef<HTMLInputElement>(null);
	React.useEffect(() => {
		if (ref.current) ref.current.indeterminate = Boolean(props.indeterminate) && !props.checked;
	}, [props.indeterminate, props.checked]);
	return React.createElement("input", {
		ref,
		className: "dsham_checkbox",
		type: "checkbox",
		checked: props.checked,
		disabled: props.disabled,
		"aria-label": props.label,
		onChange: (event: React.ChangeEvent<HTMLInputElement>) => props.onChange({ target: { checked: event.target.checked } }),
	});
}
