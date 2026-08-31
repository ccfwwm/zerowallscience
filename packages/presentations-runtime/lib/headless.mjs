import { n as PptError } from "./errors-B2SDbEye.mjs";
import { PPT_MODE_TOOL_NAMES } from "./schemas.mjs";
import { randomUUID } from "node:crypto";
import z from "schemastery";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
//#region src/headless.ts
/** PPT-aware replacement for DSH's one-shot headless runner. */
const name = "ppt-headless-runner";
const inject = [
	"agentDefaultModel",
	"agentPresets",
	"agents",
	"sessions"
];
const Config = z.object({
	task: z.string().required(),
	presetId: z.string().pattern(/^[a-z0-9][a-z0-9-]*$/).default("ppt")
});
function summarize(events, firstSeq) {
	let started = false;
	let text = "";
	let reason;
	for (const event of events) {
		if (event.seq < firstSeq) continue;
		if (event.type === "turn/start") {
			started = true;
			continue;
		}
		if (!started) continue;
		if (event.type === "assistant/message") {
			const joined = event.data.message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
			if (joined !== "") text = joined;
		}
		if (event.type === "turn/end") reason = event.data.reason;
	}
	return {
		text,
		...reason === void 0 ? {} : { reason }
	};
}
async function run(ctx, config, io) {
	await ctx.get("loader")?.await();
	const agents = ctx.get("agents");
	const defaultModel = ctx.get("agentDefaultModel");
	const presets = ctx.get("agentPresets");
	const sessions = ctx.get("sessions");
	if (agents === void 0 || defaultModel === void 0 || presets === void 0 || sessions === void 0) return;
	const selection = defaultModel.currentSelection();
	const preset = await presets.resolve(config.presetId);
	const { agent } = await agents.create({
		sessionId: SessionId(`session-${randomUUID()}`),
		meta: {
			cwd: process.cwd(),
			agentPreset: preset.id
		},
		agentOptions: {
			provider: selection.provider,
			model: selection.model
		},
		setup: async (agentCtx) => {
			installModelSelection(agentCtx, {
				current: selection,
				assembled: void 0
			});
			await presets.mount(agentCtx, preset.id);
		}
	});
	await agent.whenIdle();
	const allowed = new Set(PPT_MODE_TOOL_NAMES);
	const visible = agent.ctx.tools.schemas(agent).map((tool) => tool.name).sort();
	const unexpected = visible.filter((toolName) => !allowed.has(toolName));
	const missing = PPT_MODE_TOOL_NAMES.filter((toolName) => !visible.includes(toolName));
	if (unexpected.length > 0 || missing.length > 0) throw new PptError("PPT_CAPABILITY_UNAVAILABLE", `PPT headless tool surface mismatch; unexpected: ${unexpected.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}`);
	const firstSeq = agent.session.seq;
	agent.followup(createUserMessage({
		content: [{
			type: "text",
			text: config.task
		}],
		source: { kind: "user" }
	}));
	await agent.whenIdle();
	await sessions.flush(agent.session);
	const outcome = summarize(agent.session.events, firstSeq);
	io.stdout.write(`${outcome.text}\n`);
	if (outcome.reason?.kind === "error") io.stderr.write(`dsh: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`);
	io.exit(outcome.reason?.kind === "completed" ? 0 : 1);
}
function apply(ctx, config) {
	const exit = ctx.get("appExit");
	if (exit === void 0) throw new Error("ppt-headless-runner: launcher appExit service is unavailable");
	const io = {
		stdout: process.stdout,
		stderr: process.stderr,
		exit
	};
	run(ctx, config, io).catch((error) => {
		io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`);
		io.exit(1);
	});
}
//#endregion
export { Config, apply, inject, name };

//# sourceMappingURL=headless.mjs.map