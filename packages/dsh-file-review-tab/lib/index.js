import { randomUUID } from "node:crypto";
import { link, lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { structuredPatch } from "diff";
//#region ../../deepseek-harness/vendor/cosmokit/lib/index.js
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true for non-array object values. */
function isPlainObject(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value) => is(type, value);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
/** Binary source detection and base64/hex conversion helpers. */
var Binary;
(function(Binary) {
	Binary.is = isArrayBufferLike;
	Binary.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	Binary.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	Binary.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	Binary.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	Binary.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	Binary.fromHex = fromHex;
})(Binary || (Binary = {}));
Binary.fromBase64;
Binary.toBase64;
Binary.fromHex;
Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result = [];
		refs.set(source, result);
		source.forEach((value, index) => {
			result[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/** Deeply compare arrays, dates, regexps, buffers, and plain object fields. */
function deepEqual(a, b, strict) {
	if (a === b) return true;
	if (!strict && isNullable(a) && isNullable(b)) return true;
	if (typeof a !== typeof b) return false;
	if (typeof a !== "object") return false;
	if (!a || !b) return false;
	function check(test, then) {
		return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
	}
	return check(Array.isArray, (a, b) => a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
		if (a.byteLength !== b.byteLength) return false;
		const viewA = new Uint8Array(a);
		const viewB = new Uint8Array(b);
		for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
		return true;
	}) ?? Object.keys({
		...a,
		...b
	}).every((key) => deepEqual(a[key], b[key], strict));
}
/** Time constants plus parsing and formatting helpers. */
var Time;
(function(Time) {
	Time.millisecond = 1;
	Time.second = 1e3;
	Time.minute = Time.second * 60;
	Time.hour = Time.minute * 60;
	Time.day = Time.hour * 24;
	Time.week = Time.day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	Time.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	Time.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / Time.minute - offset) / 1440);
	}
	Time.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * Time.day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * Time.minute);
	}
	Time.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * Time.week || 0) + (parseFloat(capture[2]) * Time.day || 0) + (parseFloat(capture[3]) * Time.hour || 0) + (parseFloat(capture[4]) * Time.minute || 0) + (parseFloat(capture[5]) * Time.second || 0);
	}
	Time.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	Time.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= Time.day - Time.hour / 2) return Math.round(ms / Time.day) + "d";
		else if (abs >= Time.hour - Time.minute / 2) return Math.round(ms / Time.hour) + "h";
		else if (abs >= Time.minute - Time.second / 2) return Math.round(ms / Time.minute) + "m";
		else if (abs >= Time.second) return Math.round(ms / Time.second) + "s";
		return ms + "ms";
	}
	Time.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	Time.toDigits = toDigits;
	function template(template, time = /* @__PURE__ */ new Date()) {
		return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	Time.template = template;
})(Time || (Time = {}));
//#endregion
//#region ../../deepseek-harness/vendor/schemastery/lib/index.mjs
const kSchema = Symbol.for("schemastery");
const kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
	options;
	name = "ValidationError";
	constructor(message, options) {
		let prefix = "$";
		for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
		else if (typeof segment === "number") prefix += "[" + segment + "]";
		else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
		if (prefix.startsWith(".")) prefix = prefix.slice(1);
		super((prefix === "$" ? "" : `${prefix} `) + message);
		this.options = options;
	}
	static is(error) {
		return !!error?.[kValidationError];
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
const Schema = function(options) {
	const schema = function(data, options = {}) {
		return Schema.resolve(data, schema, options)[0];
	};
	if (options.refs) {
		const refs = mapValues(options.refs, (options) => new Schema(options));
		const getRef = (uid) => refs[uid];
		for (const key in refs) {
			const options = refs[key];
			options.sKey = getRef(options.sKey);
			options.inner = getRef(options.inner);
			options.list = options.list && options.list.map(getRef);
			options.dict = options.dict && mapValues(options.dict, getRef);
		}
		return refs[options.uid];
	}
	Object.assign(schema, options);
	if (typeof schema.callback === "string") try {
		schema.callback = new Function("return " + schema.callback)();
	} catch {}
	Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
	Object.setPrototypeOf(schema, Schema.prototype);
	schema.meta ||= {};
	schema.toString = schema.toString.bind(schema);
	return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
	return {
		version: 1,
		vendor: "schemastery",
		validate: (value) => {
			try {
				return { value: Schema.resolve(value, this, {})[0] };
			} catch (error) {
				if (ValidationError.is(error)) return { issues: [{
					message: error.message,
					path: error.options.path
				}] };
				throw error;
			}
		}
	};
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
	if (globalThis.__schemastery_refs__) {
		globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
		return this.uid;
	}
	globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
	globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
	const result = {
		uid: this.uid,
		refs: globalThis.__schemastery_refs__
	};
	globalThis.__schemastery_refs__ = void 0;
	return result;
};
Schema.prototype.set = function set(key, value) {
	this.dict[key] = value;
	return this;
};
Schema.prototype.push = function push(value) {
	this.list.push(value);
	return this;
};
function mergeDesc(original, messages) {
	const result = typeof original === "string" ? { "": original } : { ...original };
	for (const locale in messages) {
		const value = messages[locale];
		if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
		else if (typeof value === "string") result[locale] = value;
	}
	return result;
}
function getInner(value) {
	return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
	return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
	const schema = Schema(this);
	const desc = mergeDesc(schema.meta.description, messages);
	if (Object.keys(desc).length) schema.meta.description = desc;
	if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
		return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
	});
	if (schema.list) schema.list = schema.list.map((inner, index) => {
		return inner.i18n(mapValues(messages, (data = {}) => {
			if (Array.isArray(getInner(data))) return getInner(data)[index];
			if (Array.isArray(data)) return data[index];
			return extractKeys(data);
		}));
	});
	if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
		if (getInner(data)) return getInner(data);
		return extractKeys(data);
	}));
	if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
	return schema;
};
Schema.prototype.extra = function extra(key, value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
};
for (const key of [
	"required",
	"disabled",
	"collapse",
	"hidden",
	"loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.deprecated = function deprecated() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "deprecated",
		type: "danger"
	});
	return schema;
};
Schema.prototype.experimental = function experimental() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "experimental",
		type: "warning"
	});
	return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
	const schema = Schema(this);
	const pattern = pick(regexp, ["source", "flags"]);
	schema.meta = {
		...schema.meta,
		pattern
	};
	return schema;
};
Schema.prototype.simplify = function simplify(value) {
	if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
	if (isNullable(value)) return value;
	if (this.type === "object" || this.type === "dict") {
		const result = {};
		for (const key in value) {
			const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
			if (this.type === "dict" || !isNullable(item)) result[key] = item;
		}
		if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
		return result;
	} else if (this.type === "array" || this.type === "tuple") {
		const result = [];
		value.forEach((value, index) => {
			const schema = this.type === "array" ? this.inner : this.list[index];
			const item = schema ? schema.simplify(value) : value;
			result.push(item);
		});
		return result;
	} else if (this.type === "intersect") {
		const result = {};
		for (const item of this.list) Object.assign(result, item.simplify(value));
		return result;
	} else if (this.type === "union") for (const schema of this.list) try {
		Schema.resolve(value, schema, {});
		return schema.simplify(value);
	} catch {}
	return value;
};
Schema.prototype.toString = function toString(inline) {
	return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		role,
		extra
	};
	return schema;
};
for (const key of [
	"default",
	"link",
	"comment",
	"description",
	"max",
	"min",
	"step"
]) Object.assign(Schema.prototype, { [key](value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
const resolvers = {};
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
	if (options.ignore?.(data, schema)) return [data];
	if (isNullable(data) && schema.type !== "lazy") {
		if (schema.meta.required) throw new ValidationError(`missing required value`, options);
		let current = schema;
		let fallback = schema.meta.default;
		while (current?.type === "intersect" && isNullable(fallback)) {
			current = current.list[0];
			fallback = current?.meta.default;
		}
		if (isNullable(fallback)) return [data];
		data = clone(fallback);
	}
	const callback = resolvers[schema.type];
	if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
	try {
		return callback(data, schema, options, strict);
	} catch (error) {
		if (!schema.meta.loose) throw error;
		return [schema.meta.default];
	}
};
Schema.from = function from(source) {
	if (isNullable(source)) return Schema.any();
	else if ([
		"string",
		"number",
		"boolean"
	].includes(typeof source)) return Schema.const(source).required();
	else if (source[kSchema]) return source;
	else if (typeof source === "function") switch (source) {
		case String: return Schema.string().required();
		case Number: return Schema.number().required();
		case Boolean: return Schema.boolean().required();
		case Function: return Schema.function().required();
		default: return Schema.is(source).required();
	}
	else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
	const toJSON = () => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return schema.inner.toJSON();
	};
	const schema = new Schema({
		type: "lazy",
		builder,
		inner: { toJSON }
	});
	return schema;
};
Schema.natural = function natural() {
	return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
	return Schema.number().step(.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
	return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
		const date = new Date(value);
		if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
		return date;
	}, true)]);
};
Schema.regExp = function regExp(flag = "") {
	return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
		try {
			return new RegExp(value, flag);
		} catch (e) {
			throw new ValidationError(e.message, options);
		}
	}, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
	return Schema.union([
		Schema.is(ArrayBuffer),
		Schema.is(SharedArrayBuffer),
		Schema.transform(Schema.any(), (value, options) => {
			if (Binary.isSource(value)) return Binary.fromSource(value);
			throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
		}, true),
		...encoding ? [Schema.transform(Schema.string(), (value, options) => {
			try {
				return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)] : []
	]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
	if (!schema.inner[kSchema]) {
		schema.inner = schema.builder();
		schema.inner.meta = {
			...schema.meta,
			...schema.inner.meta
		};
	}
	return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
	return [data];
});
Schema.extend("never", (data, _, options) => {
	throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
	if (deepEqual(data, value)) return [value];
	throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
	const { max = Infinity, min = -Infinity } = meta;
	if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
	if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
	if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
	if (meta.pattern) {
		const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
		if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
	}
	checkWithinRange(data.length, meta, "string length", options);
	return [data];
});
function decimalShift(data, digits) {
	const str = data.toString();
	if (str.includes("e")) return data * Math.pow(10, digits);
	const index = str.indexOf(".");
	if (index === -1) return data * Math.pow(10, digits);
	const frac = str.slice(index + 1);
	const integer = str.slice(0, index);
	if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
	return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
	step = Math.abs(step);
	if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
	const index = step.toString().indexOf(".");
	const digits = step.toString().slice(index + 1).length;
	return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
	if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
	checkWithinRange(data, meta, "number", options);
	const { step } = meta;
	if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
	return [data];
});
Schema.extend("boolean", (data, _, options) => {
	if (typeof data === "boolean") return [data];
	throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
	let value = 0, keys = [];
	if (typeof data === "number") {
		value = data;
		for (const key in bits) if (data & bits[key]) keys.push(key);
	} else if (Array.isArray(data)) {
		keys = data;
		for (const key of keys) {
			if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
			if (key in bits) value |= bits[key];
		}
	} else throw new ValidationError(`expected number or array but got ${data}`, options);
	if (value === meta.default) return [value];
	return [value, keys];
});
Schema.extend("function", (data, _, options) => {
	if (typeof data === "function") return [data];
	throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
	if (typeof constructor === "function") {
		if (data instanceof constructor) return [data];
		throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
	} else {
		if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		let prototype = Object.getPrototypeOf(data);
		while (prototype) {
			if (prototype.constructor?.name === constructor) return [data];
			prototype = Object.getPrototypeOf(prototype);
		}
		throw new ValidationError(`expected ${constructor} but got ${data}`, options);
	}
});
function property(data, key, schema, options) {
	try {
		const [value, adapted] = Schema.resolve(data[key], schema, {
			...options,
			path: [...options.path || [], key]
		});
		if (adapted !== void 0) data[key] = adapted;
		return value;
	} catch (e) {
		if (!options?.autofix) throw e;
		delete data[key];
		return schema.meta.default;
	}
}
Schema.extend("array", (data, { inner, meta }, options) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
	return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in data) {
		let rKey;
		try {
			rKey = Schema.resolve(key, sKey, options)[0];
		} catch (error) {
			if (strict) continue;
			throw error;
		}
		result[rKey] = property(data, key, inner, options);
		data[rKey] = data[key];
		if (key !== rKey) delete data[key];
	}
	return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	const result = list.map((inner, index) => property(data, index, inner, options));
	if (strict) return [result];
	result.push(...data.slice(list.length));
	return [result];
});
function merge(result, data) {
	for (const key in data) {
		if (key in result) continue;
		result[key] = data[key];
	}
}
Schema.extend("object", (data, { dict }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in dict) {
		const value = property(data, key, dict[key], options);
		if (!isNullable(value) || key in data) result[key] = value;
	}
	if (!strict) merge(result, data);
	return [result];
});
Schema.extend("union", (data, { list, toString }, options, strict) => {
	const messages = [];
	for (const inner of list) try {
		return Schema.resolve(data, inner, options, strict);
	} catch (error) {
		messages.push(error);
	}
	throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString }, options, strict) => {
	if (!list.length) return [data];
	let result;
	for (const inner of list) {
		const value = Schema.resolve(data, inner, options, true)[0];
		if (isNullable(value)) continue;
		if (isNullable(result)) result = value;
		else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		else if (typeof value === "object") merge(result ??= {}, value);
		else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	}
	if (!strict && isPlainObject(data)) merge(result, data);
	return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
	const [result, adapted = data] = Schema.resolve(data, inner, options, true);
	if (preserve) return [callback(result)];
	else return [callback(result), callback(adapted)];
});
const formatters = {};
function defineMethod(name, keys, format) {
	formatters[name] = format;
	Object.assign(Schema, { [name](...args) {
		const schema = new Schema({ type: name });
		keys.forEach((key, index) => {
			switch (key) {
				case "sKey":
					schema.sKey = args[index] ?? Schema.string();
					break;
				case "inner":
					schema.inner = Schema.from(args[index]);
					break;
				case "list":
					schema.list = args[index].map(Schema.from);
					break;
				case "dict":
					schema.dict = mapValues(args[index], Schema.from);
					break;
				case "bits":
					schema.bits = {};
					for (const key in args[index]) {
						if (typeof args[index][key] !== "number") continue;
						schema.bits[key] = args[index][key];
					}
					break;
				case "callback": {
					const callback = schema.callback = args[index];
					callback["toJSON"] ||= () => callback.toString();
					break;
				}
				case "constructor": {
					const constructor = schema.constructor = args[index];
					if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
					break;
				}
				default: schema[key] = args[index];
			}
		});
		if (name === "object" || name === "dict") schema.meta.default = {};
		else if (name === "array" || name === "tuple") schema.meta.default = [];
		else if (name === "bitset") schema.meta.default = 0;
		return schema;
	} });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
	if (typeof constructor === "function") return constructor.name;
	else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
	if (Object.keys(dict).length === 0) return "{}";
	return `{ ${Object.entries(dict).map(([key, inner]) => {
		return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
	}).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
	const result = list.map(({ toString: format }) => format()).join(" | ");
	return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
	return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
	"inner",
	"callback",
	"preserve"
], ({ inner }, isInner) => inner.toString(isInner));
//#endregion
//#region src/file-review-change.ts
function validMode(mode) {
	return Number.isInteger(mode) && mode >= 0 && mode <= 511;
}
/** Whether one diff carries enough information for a strict reverse operation. */
function isReversibleDiff(diff, path) {
	if (diff.path !== path) return false;
	if (diff.lifecycle?.kind === "create") return diff.oldText === null && validMode(diff.lifecycle.mode);
	if (diff.lifecycle?.kind === "delete") return typeof diff.oldText === "string" && diff.newText === "" && validMode(diff.lifecycle.mode);
	if (diff.lifecycle !== void 0 || diff.oldText === null || diff.oldText === diff.newText) return false;
	if (diff.oldText === "" && diff.oldStart === void 0) return false;
	if (diff.newText === "" && diff.newStart === void 0) return false;
	return true;
}
/** Shared Host/browser classifier for one complete turn-scoped file change. */
function isReversibleChange(file) {
	return file.complete !== false && file.diffs.length > 0 && file.diffs.every((diff) => isReversibleDiff(diff, file.path));
}
//#endregion
//#region src/file-review-service.ts
/** Host-side, workspace-contained undo / redo service for produced text diffs. */
var FileConflictError = class extends Error {};
function sameMode(left, right) {
	const mask = process.platform === "win32" ? 128 : 511;
	return (left & mask) === (right & mask);
}
function inside$1(root, candidate) {
	const child = relative(root, candidate);
	return child === "" || !child.startsWith("..") && !isAbsolute(child);
}
function errorCode$1(error, code) {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
async function resolveFile(cwd, requestedPath) {
	const root = await realpath(cwd);
	const candidate = resolve(root, requestedPath);
	if (!inside$1(root, candidate)) throw new Error("path is outside the session workspace");
	let linkStat;
	try {
		linkStat = await lstat(candidate);
	} catch (error) {
		if (!errorCode$1(error, "ENOENT")) throw error;
		const parent = await realpath(dirname(candidate));
		if (!inside$1(root, parent)) throw new Error("resolved path is outside the session workspace");
		return {
			kind: "missing",
			filename: resolve(parent, basename(candidate))
		};
	}
	if (linkStat.isSymbolicLink()) throw new Error("symbolic links are not supported");
	if (!linkStat.isFile()) throw new Error("path is not a regular file");
	if (linkStat.size > 16 * 1024 * 1024) throw new Error("file exceeds the 16 MiB review limit");
	const filename = await realpath(candidate);
	if (!inside$1(root, filename)) throw new Error("resolved path is outside the session workspace");
	const bytes = await readFile(filename);
	const text = bytes.toString("utf8");
	if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("file is not valid UTF-8 text");
	return {
		kind: "file",
		filename,
		mode: linkStat.mode & 511,
		bytes,
		text
	};
}
function offsetAtLine$1(text, line) {
	if (!Number.isInteger(line) || line < 1) return null;
	if (line === 1) return 0;
	let offset = 0;
	for (let current = 1; current < line; current += 1) {
		const next = text.indexOf("\n", offset);
		if (next === -1) return null;
		offset = next + 1;
	}
	return offset;
}
function replaceHunk(text, source, replacement, line) {
	if (text.includes("\r\n") && !text.replaceAll("\r\n", "").includes("\n")) {
		const changed = replaceHunk(text.replaceAll("\r\n", "\n"), source.replaceAll("\r\n", "\n"), replacement.replaceAll("\r\n", "\n"), line);
		return changed === null ? null : changed.replaceAll("\n", "\r\n");
	}
	let offset;
	if (line !== void 0) {
		const located = offsetAtLine$1(text, line);
		if (located === null || text.slice(located, located + source.length) !== source) return null;
		offset = located;
	} else {
		if (source === "") return null;
		offset = text.indexOf(source);
		if (offset === -1 || text.indexOf(source, offset + 1) !== -1) return null;
	}
	return text.slice(0, offset) + replacement + text.slice(offset + source.length);
}
/** Apply a complete file's hunk sequence in memory, or report a strict mismatch. */
function transformFile(text, file, action) {
	if (!isReversibleChange(file) || file.diffs.some((diff) => diff.lifecycle !== void 0)) return null;
	const diffs = action === "undo" ? [...file.diffs].reverse() : file.diffs;
	let next = text;
	for (const diff of diffs) {
		const source = action === "undo" ? diff.newText : diff.oldText;
		const replacement = action === "undo" ? diff.oldText : diff.newText;
		if (source === null || replacement === null) return null;
		const changed = replaceHunk(next, source, replacement, action === "undo" ? diff.newStart : diff.oldStart);
		if (changed === null) return null;
		next = changed;
	}
	return next;
}
function virtualFile(image, text, mode) {
	return {
		kind: "file",
		filename: image.filename,
		mode,
		bytes: Buffer.from(text),
		text
	};
}
function transformImage(image, file, action) {
	if (!isReversibleChange(file)) return null;
	const diffs = action === "undo" ? [...file.diffs].reverse() : file.diffs;
	let next = image;
	for (const diff of diffs) {
		if (diff.lifecycle?.kind === "create") {
			if (action === "redo") {
				if (next.kind !== "missing") return null;
				next = virtualFile(next, diff.newText, diff.lifecycle.mode);
			} else {
				if (next.kind !== "file" || next.text !== diff.newText || !sameMode(next.mode, diff.lifecycle.mode)) return null;
				next = {
					kind: "missing",
					filename: next.filename
				};
			}
			continue;
		}
		if (diff.lifecycle?.kind === "delete") {
			if (diff.oldText === null) return null;
			if (action === "redo") {
				if (next.kind !== "file" || next.text !== diff.oldText || !sameMode(next.mode, diff.lifecycle.mode)) return null;
				next = {
					kind: "missing",
					filename: next.filename
				};
			} else {
				if (next.kind !== "missing") return null;
				next = virtualFile(next, diff.oldText, diff.lifecycle.mode);
			}
			continue;
		}
		if (next.kind !== "file" || diff.oldText === null) return null;
		const source = action === "undo" ? diff.newText : diff.oldText;
		const replacement = action === "undo" ? diff.oldText : diff.newText;
		const changed = replaceHunk(next.text, source, replacement, action === "undo" ? diff.newStart : diff.oldStart);
		if (changed === null) return null;
		next = virtualFile(next, changed, next.mode);
	}
	return next;
}
function sameImage(left, right) {
	return left.kind === "missing" ? right.kind === "missing" : right.kind === "file" && left.text === right.text && sameMode(left.mode, right.mode);
}
function inspectImage(image, file, requestedAction) {
	if (!isReversibleChange(file)) return {
		state: "unsupported",
		reason: "change has no complete reversible diff"
	};
	const undone = transformImage(image, file, "undo");
	const redone = transformImage(image, file, "redo");
	if (undone !== null && redone !== null) {
		if (sameImage(undone, image) && sameImage(redone, image)) return { state: requestedAction === "undo" ? "applied" : "undone" };
		return {
			state: "conflict",
			reason: "file matches both diff directions ambiguously"
		};
	}
	if (undone !== null) return { state: "applied" };
	if (redone !== null) return { state: "undone" };
	return {
		state: "conflict",
		reason: "current content does not match the recorded change"
	};
}
async function inspectOne(cwd, file, action) {
	if (!isReversibleChange(file)) return {
		path: file.path,
		state: "unsupported",
		changed: false,
		reason: "change has no complete reversible diff"
	};
	try {
		const inspected = inspectImage(await resolveFile(cwd, file.path), file, action);
		return {
			path: file.path,
			state: inspected.state,
			changed: false,
			reason: inspected.reason
		};
	} catch (error) {
		return {
			path: file.path,
			state: "error",
			changed: false,
			reason: error instanceof Error ? error.message : String(error)
		};
	}
}
async function assertUnchanged(image) {
	try {
		const currentStat = await lstat(image.filename);
		if (currentStat.isSymbolicLink() || !currentStat.isFile() || (currentStat.mode & 511) !== image.mode) throw new FileConflictError("file changed while the operation was being prepared");
		const current = await readFile(image.filename);
		if (!Buffer.from(image.bytes).equals(current)) throw new FileConflictError("file changed while the operation was being prepared");
	} catch (error) {
		if (error instanceof FileConflictError) throw error;
		throw new FileConflictError("file changed while the operation was being prepared");
	}
}
async function createFileAtomicExclusive(image) {
	const temp = `${image.filename}.${randomUUID()}.tmp`;
	const handle = await open(temp, "wx", image.mode);
	try {
		try {
			await handle.writeFile(image.text, "utf8");
			await handle.chmod(image.mode);
		} finally {
			await handle.close();
		}
		try {
			await link(temp, image.filename);
		} catch (error) {
			if (errorCode$1(error, "EEXIST")) throw new FileConflictError("target path is no longer missing");
			throw error;
		}
	} finally {
		await unlink(temp).catch(() => {});
	}
}
async function replaceFileAtomicExact(current, target) {
	const temp = `${target.filename}.${randomUUID()}.tmp`;
	const handle = await open(temp, "wx", target.mode);
	try {
		try {
			await handle.writeFile(target.text, "utf8");
			await handle.chmod(target.mode);
		} finally {
			await handle.close();
		}
		await assertUnchanged(current);
		await rename(temp, target.filename);
	} finally {
		await unlink(temp).catch(() => {});
	}
}
async function commitImage(current, target) {
	if (sameImage(current, target)) return false;
	if (current.kind === "file") await assertUnchanged(current);
	if (current.kind === "file" && target.kind === "missing") {
		await unlink(current.filename);
		return true;
	}
	if (current.kind === "missing" && target.kind === "file") {
		try {
			await lstat(current.filename);
			throw new FileConflictError("target path is no longer missing");
		} catch (error) {
			if (!errorCode$1(error, "ENOENT")) throw error;
		}
		await createFileAtomicExclusive(target);
		return true;
	}
	if (current.kind === "file" && target.kind === "file") {
		await replaceFileAtomicExact(current, target);
		return true;
	}
	return false;
}
async function applyOne(cwd, file, action) {
	if (!isReversibleChange(file)) return {
		path: file.path,
		state: "unsupported",
		changed: false,
		reason: "change has no complete reversible diff"
	};
	try {
		const resolved = await resolveFile(cwd, file.path);
		const targetState = action === "undo" ? "undone" : "applied";
		const target = transformImage(resolved, file, action);
		const reverse = transformImage(resolved, file, action === "undo" ? "redo" : "undo");
		if (target === null) {
			if (reverse !== null) return {
				path: file.path,
				state: targetState,
				changed: false
			};
			return {
				path: file.path,
				state: "conflict",
				changed: false,
				reason: "current content does not match the recorded change"
			};
		}
		if (reverse !== null && !(sameImage(target, resolved) && sameImage(reverse, resolved))) return {
			path: file.path,
			state: "conflict",
			changed: false,
			reason: "file matches both diff directions ambiguously"
		};
		const changed = await commitImage(resolved, target);
		return {
			path: file.path,
			state: targetState,
			changed
		};
	} catch (error) {
		if (error instanceof FileConflictError) return {
			path: file.path,
			state: "conflict",
			changed: false,
			reason: error.message
		};
		return {
			path: file.path,
			state: "error",
			changed: false,
			reason: error instanceof Error ? error.message : String(error)
		};
	}
}
function sessionCwd(agent) {
	const cwd = agent.session.header.cwd;
	if (cwd === void 0 || cwd.trim() === "") throw new Error("session has no workspace directory");
	return cwd;
}
/** Host service published as the `fileReview` Remote namespace. */
var FileReviewService = class extends TypertRemoteService {
	constructor(ctx) {
		super(ctx, "fileReview");
	}
	/** Inspect current disk state without changing files. */
	async status(agent, request) {
		const cwd = sessionCwd(agent);
		return { files: await Promise.all(request.files.map((file) => inspectOne(cwd, file, request.action))) };
	}
	/** Toggle every independently safe file while the receiving Agent is idle. */
	async apply(agent, request) {
		const cwd = sessionCwd(agent);
		return agent.runMaintenance(async () => {
			const files = [];
			for (const file of request.files) files.push(await applyOne(cwd, file, request.action));
			return { files };
		});
	}
};
const PTC_FILE_REVIEW_MAX_BYTES = 256 * 1024;
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function positiveInteger(value) {
	return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
function pathOf$1(value) {
	const item = record(value);
	return item !== null && typeof item.path === "string" && item.path !== "" ? item.path : null;
}
function diffPresentation(value) {
	const view = record(value);
	if (view?.card !== "diff") return { kind: "absent" };
	if (!Array.isArray(view.diffs)) return { kind: "invalid" };
	const diffs = [];
	for (const candidate of view.diffs) {
		const diff = record(candidate);
		if (diff === null) return { kind: "invalid" };
		const { path, oldText, newText, oldStart, newStart } = diff;
		if (typeof path !== "string" || path === "" || oldText !== null && typeof oldText !== "string" || typeof newText !== "string" || oldStart !== void 0 && !positiveInteger(oldStart) || newStart !== void 0 && !positiveInteger(newStart)) return { kind: "invalid" };
		diffs.push({
			path,
			oldText,
			newText,
			...typeof oldStart === "number" ? { oldStart } : {},
			...typeof newStart === "number" ? { newStart } : {}
		});
	}
	return {
		kind: "present",
		diffs
	};
}
function isMutationCall(view) {
	const item = record(view);
	if (item === null) return false;
	if (item.card === "diff" || item.card === "generic" && item.kind === "edit") return true;
	return item.card === "generic" && item.kind === "delete" && locationPaths(item).length > 0;
}
function locationPaths(view) {
	const item = record(view);
	if (item === null || item.card !== "diff" && !(item.card === "generic" && (item.kind === "edit" || item.kind === "delete")) || !Array.isArray(item.locations)) return [];
	return item.locations.map(pathOf$1).filter((path) => path !== null);
}
function appendPath(paths, seen, path) {
	if (seen.has(path)) return;
	seen.add(path);
	paths.push(path);
}
function resultChanges(diffs) {
	const files = [];
	const byPath = /* @__PURE__ */ new Map();
	for (const diff of diffs) {
		const existing = byPath.get(diff.path);
		if (existing !== void 0) {
			existing.push(diff);
			continue;
		}
		const grouped = [diff];
		byPath.set(diff.path, grouped);
		files.push({
			path: diff.path,
			diffs: grouped,
			source: "result"
		});
	}
	return files;
}
/**
* Normalize tool presentation without knowing the tool name. Applied result
* hunks win; call-time intent is the accepted fallback when they are absent.
*/
function normalizeMutationPresentation(callView, resultView) {
	if (!isMutationCall(callView)) return [];
	const result = diffPresentation(resultView);
	if (result.kind === "invalid") return [];
	if (result.kind === "present") return resultChanges(result.diffs);
	const intent = diffPresentation(callView);
	if (intent.kind === "invalid") return [];
	const intentDiffs = intent.kind === "present" ? intent.diffs : [];
	const paths = [];
	const seen = /* @__PURE__ */ new Set();
	for (const path of locationPaths(callView)) appendPath(paths, seen, path);
	for (const diff of intentDiffs) appendPath(paths, seen, diff.path);
	return paths.map((path) => ({
		path,
		diffs: intentDiffs.filter((diff) => diff.path === path),
		source: "intent"
	}));
}
function parseLifecycle(value) {
	const lifecycle = record(value);
	if (lifecycle === null || lifecycle.kind !== "create" && lifecycle.kind !== "delete" || typeof lifecycle.mode !== "number" || !Number.isInteger(lifecycle.mode) || lifecycle.mode < 0 || lifecycle.mode > 511) return null;
	return {
		kind: lifecycle.kind,
		mode: lifecycle.mode
	};
}
function parseDiff(value, expectedPath, schema) {
	const item = record(value);
	if (item === null || item.path !== expectedPath) return null;
	const { path, oldText, newText, oldStart, newStart, lifecycle: rawLifecycle } = item;
	if (typeof path !== "string" || oldText !== null && typeof oldText !== "string" || typeof newText !== "string" || oldStart !== void 0 && !positiveInteger(oldStart) || newStart !== void 0 && !positiveInteger(newStart)) return null;
	const lifecycle = rawLifecycle === void 0 ? void 0 : parseLifecycle(rawLifecycle);
	if (rawLifecycle !== void 0 && lifecycle === null || schema === 1 && rawLifecycle !== void 0 || lifecycle?.kind === "create" && oldText !== null || lifecycle?.kind === "delete" && (typeof oldText !== "string" || newText !== "")) return null;
	return {
		path,
		oldText,
		newText,
		...typeof oldStart === "number" ? { oldStart } : {},
		...typeof newStart === "number" ? { newStart } : {},
		...lifecycle !== void 0 && lifecycle !== null ? { lifecycle } : {}
	};
}
function parseFile(value, schema) {
	const item = record(value);
	if (item === null || typeof item.path !== "string" || item.path === "" || item.source !== "result" && item.source !== "intent" || !Array.isArray(item.diffs)) return null;
	const diffs = [];
	for (const value of item.diffs) {
		const diff = parseDiff(value, item.path, schema);
		if (diff === null) return null;
		diffs.push(diff);
	}
	return {
		path: item.path,
		diffs,
		source: item.source
	};
}
/** Parse and detach one marker, optionally requiring its event correlations. */
function parsePtcFileReviewMarker(value, expected) {
	const marker = record(value);
	if (marker === null || marker.schema !== 1 && marker.schema !== 2 || typeof marker.turn !== "number" || !Number.isInteger(marker.turn) || marker.turn < 0 || typeof marker.step !== "number" || !Number.isInteger(marker.step) || marker.step < 0 || typeof marker.rootCallId !== "string" || marker.rootCallId === "" || typeof marker.subCallId !== "string" || marker.subCallId === "" || typeof marker.truncated !== "boolean" || !Array.isArray(marker.files) || expected !== void 0 && (marker.rootCallId !== expected.rootCallId || marker.subCallId !== expected.subCallId)) return null;
	const files = [];
	const seen = /* @__PURE__ */ new Set();
	for (const value of marker.files) {
		const file = parseFile(value, marker.schema);
		if (file === null || seen.has(file.path) || marker.truncated === true && file.diffs.length > 0) return null;
		seen.add(file.path);
		files.push(file);
	}
	if (files.length === 0) return null;
	return {
		schema: marker.schema,
		turn: marker.turn,
		step: marker.step,
		rootCallId: marker.rootCallId,
		subCallId: marker.subCallId,
		files,
		truncated: marker.truncated
	};
}
/** Read the last valid invisible marker from one PTC settlement content array. */
function markerFromContent(content, expected) {
	for (let index = content.length - 1; index >= 0; index--) {
		const block = record(content[index]);
		if (block?.type !== "text" || block.text !== "") continue;
		const marker = parsePtcFileReviewMarker(block.dshFileReview, expected);
		if (marker !== null) return marker;
	}
	return null;
}
function bytes(value) {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
/** Bound one marker before it is duplicated into the durable PTC log. */
function boundedPtcFileReviewMarker(marker, maxBytes = PTC_FILE_REVIEW_MAX_BYTES) {
	const complete = {
		schema: 2,
		...marker,
		truncated: false
	};
	if (bytes(complete) <= maxBytes) return complete;
	const truncated = {
		...complete,
		files: complete.files.map((file) => ({
			...file,
			diffs: []
		})),
		truncated: true
	};
	return bytes(truncated) <= maxBytes ? truncated : null;
}
/** Build the invisible standard text block used as the durable carrier. */
function markerBlock(marker) {
	return {
		type: "text",
		text: "",
		dshFileReview: marker
	};
}
//#endregion
//#region src/file-lifecycle-capture.ts
/** Capture exact file transitions around successful mutation tools. */
const INLINE_UNCHANGED_LINES = 5;
function inside(root, candidate) {
	const child = relative(root, candidate);
	return child === "" || !child.startsWith("..") && !isAbsolute(child);
}
function errorCode(error, code) {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
async function capturePath(root, path) {
	const candidate = resolve(root, path);
	if (!inside(root, candidate)) return null;
	let stat;
	try {
		stat = await lstat(candidate);
	} catch (error) {
		return errorCode(error, "ENOENT") ? { kind: "missing" } : null;
	}
	if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 16 * 1024 * 1024) return null;
	const filename = await realpath(candidate);
	if (!inside(root, filename)) return null;
	const bytes = await readFile(filename);
	const text = bytes.toString("utf8");
	if (!Buffer.from(text, "utf8").equals(bytes)) return null;
	return {
		kind: "file",
		text,
		mode: stat.mode & 511
	};
}
function pathOf(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	const path = value.path;
	return typeof path === "string" && path !== "" ? path : null;
}
function mutationPaths(view) {
	if (view === void 0) return [];
	if (!(view.card === "diff" || view.card === "generic" && (view.kind === "edit" || view.kind === "delete"))) return [];
	const paths = [];
	const seen = /* @__PURE__ */ new Set();
	const append = (path) => {
		if (path === null || seen.has(path)) return;
		seen.add(path);
		paths.push(path);
	};
	if ("locations" in view) for (const location of view.locations ?? []) append(pathOf(location));
	if (view.card === "diff") for (const diff of view.diffs) append(pathOf(diff));
	return paths;
}
function rootCall$1(agent, rootCallId) {
	const events = agent.session.snapshotEvents();
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (event?.type !== "tool/call" || event.data.callId !== rootCallId || !Number.isInteger(event.data.turn) || event.data.turn < 0 || !Number.isInteger(event.data.step) || event.data.step < 0) continue;
		return {
			turn: event.data.turn,
			step: event.data.step
		};
	}
	return null;
}
async function captureImages(root, paths) {
	const entries = await Promise.all(paths.map(async (path) => [path, await capturePath(root, path)]));
	return new Map(entries);
}
/** Find the string offset of a one-based line, or null when that line does not exist. */
function offsetAtLine(text, line) {
	let offset = 0;
	for (let current = 1; current < line; current += 1) {
		const next = text.indexOf("\n", offset);
		if (next === -1) return null;
		offset = next + 1;
	}
	return offset;
}
/** Slice an exact line range while preserving its original newline characters. */
function lineRange(text, start, count) {
	const from = offsetAtLine(text, start);
	if (from === null) return null;
	if (count === 0) return "";
	let to = from;
	for (let current = 0; current < count; current += 1) {
		const next = text.indexOf("\n", to);
		if (next === -1) return current === count - 1 ? text.slice(from) : null;
		to = next + 1;
	}
	return text.slice(from, to);
}
/** Keep up to five unchanged lines inline by joining compatible neighboring hunks. */
function mergeNearbyHunks(hunks) {
	const merged = [];
	for (const hunk of hunks) {
		const previous = merged.at(-1);
		if (previous !== void 0) {
			const oldGap = hunk.oldStart - (previous.oldStart + previous.oldLines);
			if (oldGap === hunk.newStart - (previous.newStart + previous.newLines) && oldGap >= 0 && oldGap <= INLINE_UNCHANGED_LINES) {
				previous.oldLines = hunk.oldStart + hunk.oldLines - previous.oldStart;
				previous.newLines = hunk.newStart + hunk.newLines - previous.newStart;
				continue;
			}
		}
		merged.push({
			oldStart: hunk.oldStart,
			oldLines: hunk.oldLines,
			newStart: hunk.newStart,
			newLines: hunk.newLines
		});
	}
	return merged;
}
/** Derive authoritative, line-addressed hunks from complete before/after file images. */
function snapshotDiffs(path, oldText, newText) {
	return mergeNearbyHunks(structuredPatch(path, path, oldText, newText, void 0, void 0, { context: 0 }).hunks).flatMap((hunk) => {
		const oldRange = lineRange(oldText, hunk.oldStart, hunk.oldLines);
		const newRange = lineRange(newText, hunk.newStart, hunk.newLines);
		return oldRange === null || newRange === null ? [] : [{
			path,
			oldText: oldRange,
			newText: newRange,
			oldStart: hunk.oldStart,
			newStart: hunk.newStart
		}];
	});
}
/** Convert captured file images into review changes for creates, deletes, and edits. */
function snapshotFiles(paths, before, after) {
	const files = [];
	for (const path of paths) {
		const oldImage = before.get(path);
		const newImage = after.get(path);
		if (oldImage?.kind === "missing" && newImage?.kind === "file") files.push({
			path,
			source: "result",
			diffs: [{
				path,
				oldText: null,
				newText: newImage.text,
				oldStart: 1,
				newStart: 1,
				lifecycle: {
					kind: "create",
					mode: newImage.mode
				}
			}]
		});
		else if (oldImage?.kind === "file" && newImage?.kind === "missing") files.push({
			path,
			source: "result",
			diffs: [{
				path,
				oldText: oldImage.text,
				newText: "",
				oldStart: 1,
				newStart: 1,
				lifecycle: {
					kind: "delete",
					mode: oldImage.mode
				}
			}]
		});
		else if (oldImage?.kind === "file" && newImage?.kind === "file" && oldImage.text !== newImage.text) {
			const diffs = snapshotDiffs(path, oldImage.text, newImage.text);
			if (diffs.length > 0) files.push({
				path,
				source: "result",
				diffs
			});
		}
	}
	return files;
}
/** Prefer snapshot-derived diffs while retaining tool presentation for uncaptured paths. */
function mergePresentedFiles(presented, captured) {
	const replacements = new Map(captured.map((file) => [file.path, file]));
	return [...presented.map((file) => {
		const replacement = replacements.get(file.path);
		replacements.delete(file.path);
		return replacement ?? file;
	}), ...replacements.values()];
}
/** Register snapshot capture without changing mutation-tool success or failure semantics. */
function registerFileLifecycleCapture(ctx) {
	const captured = /* @__PURE__ */ new Map();
	ctx.on("tools/execute", async (exec, next) => {
		const agent = exec.agent;
		const cwd = agent?.session.header.cwd;
		let paths = [];
		let callView;
		try {
			callView = ctx.tools.get(exec.name, agent)?.presentCall?.(exec.arguments);
			paths = mutationPaths(callView);
		} catch {
			paths = [];
		}
		if (agent === void 0 || cwd === void 0 || cwd.trim() === "" || paths.length === 0) return next();
		let root;
		let before;
		try {
			root = await realpath(cwd);
			before = await captureImages(root, paths);
		} catch {
			return next();
		}
		const result = await next();
		if (result.isError) return result;
		try {
			const after = await captureImages(root, paths);
			const snapshots = snapshotFiles(paths, before, after);
			let presented;
			try {
				const resultView = ctx.tools.get(exec.name, agent)?.presentResult?.(exec.arguments, result);
				presented = normalizeMutationPresentation(callView, resultView);
			} catch {
				presented = normalizeMutationPresentation(callView, void 0);
			}
			const files = mergePresentedFiles(presented, snapshots);
			const owner = rootCall$1(agent, exec.rootCallId);
			if (snapshots.length > 0 && files.length > 0 && owner !== null) captured.set(exec.token, {
				files,
				turn: owner.turn,
				step: owner.step,
				rootCallId: exec.rootCallId,
				subCallId: exec.callId
			});
		} catch {}
		return result;
	});
	ctx.on("tools/post-execute", async (exec, result, next) => {
		const decision = await next();
		const snapshot = captured.get(exec.token);
		captured.delete(exec.token);
		if (result.isError || snapshot === void 0 || decision.kind !== "accept" || "value" in decision) return decision;
		const marker = boundedPtcFileReviewMarker(snapshot);
		if (marker === null) return decision;
		return {
			...decision,
			content: [...decision.content ?? result.content, markerBlock(marker)]
		};
	});
	ctx.on("tools/result", (exec) => {
		captured.delete(exec.token);
	});
}
//#endregion
//#region src/ptc-adapter.ts
function dispatchStart(events, dispatch) {
	const rootCallId = dispatch.exec.rootCallId;
	const subCallId = dispatch.subCallId;
	if (typeof rootCallId !== "string" || rootCallId === "" || typeof subCallId !== "string" || subCallId === "") return null;
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (event?.type !== "tool/code-dispatch-start" || event.data.subCallId !== subCallId || event.data.rootCallId !== rootCallId || event.data.name !== dispatch.name) continue;
		return {
			arguments: event.data.arguments,
			rootCallId,
			subCallId
		};
	}
	return null;
}
function rootCall(events, rootCallId) {
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (event?.type !== "tool/call" || event.data.callId !== rootCallId || !Number.isInteger(event.data.turn) || event.data.turn < 0 || !Number.isInteger(event.data.step) || event.data.step < 0) continue;
		return {
			turn: event.data.turn,
			step: event.data.step
		};
	}
	return null;
}
function present(run) {
	try {
		return {
			kind: "ok",
			view: run()
		};
	} catch {
		return { kind: "error" };
	}
}
function sanitizeLoggedContent(content) {
	let sanitized;
	for (let index = 0; index < content.length; index++) {
		const block = content[index];
		if (typeof block !== "object" || block === null || !Object.prototype.hasOwnProperty.call(block, "dshFileReview")) continue;
		const copy = { ...block };
		delete copy.dshFileReview;
		sanitized ??= [...content];
		sanitized[index] = copy;
	}
	return sanitized ?? content;
}
/**
* Await the existing log shapers, then append this plugin's invisible marker.
* Any Adapter failure degrades to the already-shaped content.
*/
async function adaptPtcDispatchLog(ctx, dispatch, next) {
	const loggedContent = sanitizeLoggedContent(await next());
	if (dispatch.isError || dispatch.agent === void 0) return loggedContent;
	try {
		const events = dispatch.agent.session.snapshotEvents();
		const start = dispatchStart(events, dispatch);
		if (start === null) return loggedContent;
		const root = rootCall(events, start.rootCallId);
		if (root === null) return loggedContent;
		const captured = markerFromContent(dispatch.content, {
			rootCallId: start.rootCallId,
			subCallId: start.subCallId
		});
		const definition = ctx.tools.get(dispatch.name, dispatch.agent);
		if (definition === void 0) return loggedContent;
		const call = definition.presentCall === void 0 ? {
			kind: "ok",
			view: void 0
		} : present(() => definition.presentCall?.(start.arguments));
		if (call.kind === "error") return loggedContent;
		const result = definition.presentResult === void 0 ? {
			kind: "ok",
			view: void 0
		} : present(() => definition.presentResult?.(start.arguments, {
			content: dispatch.content,
			isError: false
		}));
		if (result.kind === "error") return loggedContent;
		const files = captured !== null && captured.turn === root.turn && captured.step === root.step ? captured.files : normalizeMutationPresentation(call.view, result.view);
		if (files.length === 0) return loggedContent;
		const marker = boundedPtcFileReviewMarker({
			turn: root.turn,
			step: root.step,
			rootCallId: start.rootCallId,
			subCallId: start.subCallId,
			files
		});
		return marker === null ? loggedContent : [...loggedContent, markerBlock(marker)];
	} catch {
		return loggedContent;
	}
}
/** Register the Adapter on the awaited Code Mode log-copy seam. */
function registerPtcAdapter(ctx) {
	return ctx.on("tools/ptc-dispatch-log", (dispatch, next) => adaptPtcDispatchLog(ctx, dispatch, next));
}
//#endregion
//#region src/settings-contract.ts
/** Shared Host/browser contract for file-review display preferences. */
/** Settings namespace owned by this plugin. */
const FILE_REVIEW_SETTINGS_NAMESPACE = "file-review";
/** Preserve the existing horizontally scrollable diff presentation by default. */
const DEFAULT_WORD_WRAP = false;
//#endregion
//#region src/index.ts
/** Plugin configuration and durable settings schema. */
const Config = Schema.object({ wordWrap: Schema.boolean().default(false) });
/** Services required for the model guidance paired with the browser renderer. */
const inject = [
	"systemPrompt",
	"tools",
	"settings"
];
/** Stable final-response guidance owned by the matching renderer. */
const FILE_REFERENCE_PROMPT = "When you successfully create or modify files, mention the primary outputs in your final response. To make those and any other changed-file references clickable in Web, format them as Markdown inline code using the exact file-tool path, or a basename when unique among the files changed in that turn.";
/**
* Register model guidance for the file-reference renderer shipped by this package.
* @param ctx - host context carrying the system-prompt registry.
*/
function apply(ctx, config = {}) {
	ctx.settings.register(FILE_REVIEW_SETTINGS_NAMESPACE, Config, { base: config });
	new FileReviewService(ctx);
	registerFileLifecycleCapture(ctx);
	registerPtcAdapter(ctx);
	ctx.systemPrompt.section({
		name: "ui:file-review-references",
		order: 190,
		text: FILE_REFERENCE_PROMPT
	});
}
//#endregion
export { Config, DEFAULT_WORD_WRAP, FILE_REVIEW_SETTINGS_NAMESPACE, FileReviewService, apply, inject, transformFile };
