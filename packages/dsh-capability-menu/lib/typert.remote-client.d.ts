import { RemoteResult, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";

//#region src/client/remote.d.ts
/** Read-only row: one capability's Resident/On-demand/Disabled classification. */
interface CapabilityRow {
  readonly id: string;
  readonly kind: 'tool' | 'skill';
  readonly name: string;
  readonly server?: string;
  /** Skill source root label (`project-dsh`/`user-agents`/…), present only for skills. */
  readonly source?: string;
  readonly class: 'resident' | 'on-demand' | 'disabled';
  readonly classLabel?: string;
  readonly mandatory: boolean;
}
/** 能力目录查看负载：两份只读「文件」+ 缺失原因。 */
interface CatalogDocs {
  /** 当前生效的三档策略配置 YAML。 */
  readonly policyYaml: string;
  /** 按需能力目录物化文件（path + content）。 */
  readonly catalog?: {
    readonly path: string;
    readonly content: string;
  };
  /** catalog 不可用原因：'disabled' = 物化未启用；'read-failed' = 读盘失败。 */
  readonly catalogMissing?: 'disabled' | 'read-failed';
}
/** One direct child in a skill directory listing. */
interface SkillFileEntry {
  readonly name: string;
  readonly type: 'file' | 'directory';
}
/** Full detail projection of one capability (schema, description, stats). */
interface ToolDetail {
  readonly id: string;
  readonly kind: 'tool' | 'skill';
  readonly actions: readonly string[];
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
  readonly parameters: Record<string, unknown>;
  readonly output?: Record<string, unknown>;
  readonly origin: {
    readonly provider: string;
    readonly serverName?: string;
    readonly path?: string;
    readonly source?: string;
  };
  readonly tags: readonly string[];
  readonly stats: {
    readonly uses: number;
    readonly successes: number;
    readonly failures: number;
    readonly totalMs: number;
    readonly lastUsedAt?: number;
  };
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$6361706162696c697479506f6c696379 {
    getConfig: (sessionId?: string) => Promise<RemoteResult<Record<string, unknown>>>;
    updateConfig: (partial: Record<string, unknown>, sessionId?: string) => Promise<RemoteResult<void>>;
    resetDefaults: (sessionId?: string) => Promise<RemoteResult<CapabilityRow[]>>;
    classifyAll: (sessionId?: string) => Promise<RemoteResult<CapabilityRow[]>>;
    listSkillDir: (id: string, relPath?: string) => Promise<RemoteResult<SkillFileEntry[] | undefined>>;
    readSkillFile: (id: string, relPath: string) => Promise<RemoteResult<string | undefined>>;
    getDetail: (id: string) => Promise<RemoteResult<ToolDetail | undefined>>;
    getCatalogDocs: () => Promise<RemoteResult<CatalogDocs>>;
  }
  interface TypertRemoteMap {
    'capabilityPolicy/getConfig': (sessionId?: string) => Promise<RemoteResult<Record<string, unknown>>>;
    'capabilityPolicy/updateConfig': (partial: Record<string, unknown>, sessionId?: string) => Promise<RemoteResult<void>>;
    'capabilityPolicy/resetDefaults': (sessionId?: string) => Promise<RemoteResult<CapabilityRow[]>>;
    'capabilityPolicy/classifyAll': (sessionId?: string) => Promise<RemoteResult<CapabilityRow[]>>;
    'capabilityPolicy/listSkillDir': (id: string, relPath?: string) => Promise<RemoteResult<SkillFileEntry[] | undefined>>;
    'capabilityPolicy/readSkillFile': (id: string, relPath: string) => Promise<RemoteResult<string | undefined>>;
    'capabilityPolicy/getDetail': (id: string) => Promise<RemoteResult<ToolDetail | undefined>>;
    'capabilityPolicy/getCatalogDocs': () => Promise<RemoteResult<CatalogDocs>>;
  }
  interface TypertRemoteNamespaceMap {
    'capabilityPolicy': TypertRemoteNamespace$6361706162696c697479506f6c696379;
  }
}
declare const TYPERT_REMOTE: TypertRemoteContribution;
//#endregion
export { CapabilityRow, CatalogDocs, SkillFileEntry, TYPERT_REMOTE, TYPERT_REMOTE as default, ToolDetail };
//# sourceMappingURL=typert.remote-client.d.ts.map