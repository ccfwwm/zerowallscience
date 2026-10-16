import type { Context } from "@deepseek-ai/cordis";
//#region lib/types/index.js
/**
 * @michengai/dsh-archive-manager 根宿主入口。
 *
 * 发布包是单个 DSH 插件。诊断、删除和安全缓存都由这一条服务行安装，
 * 不再另插一条可以单独停用的 host 行。浏览器端由 package.json 的
 * `dsh.client` 声明发现，对应同一个插件入口。
 */
import { apply as installHost, inject as hostInject } from "./host-install.js";

const inject = hostInject;

async function apply(ctx: Context) {
	// ZeroWall owns signed downloads, candidate profiles, activation and rollback.
	return installHost(ctx);
}
//#endregion
export { apply, inject };
