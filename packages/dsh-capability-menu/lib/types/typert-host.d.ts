/** Host and browser use the same codecs; dispatch targets the gateway service. */
export declare const TYPERT: {
    package: string;
    face: string;
    schemas: never[];
    invocations: {
        service: string;
        id: string;
        namespace: string;
        method: string;
        implementation?: string;
        mode?: "stream";
        invocation: {
            readonly kind: "direct";
        } | {
            readonly kind: "context";
            readonly context: string;
            readonly wire: string;
            readonly codec: import("@deepseek-ai/dsh-typert-protocol").TypertCodec;
        };
        scope?: {
            readonly context: string;
            readonly wire: string;
        };
        parameters: readonly import("@deepseek-ai/dsh-typert-protocol").InvocationParameterDescriptor[];
        cancellation?: {
            readonly parameter: "signal";
        };
        result: import("@deepseek-ai/dsh-typert-protocol").TypertCodec;
        sourceLocation?: import("@deepseek-ai/dsh-typert-protocol").InvocationSourceLocation;
    }[];
    model: {
        services: never[];
        events: never[];
        objects: never[];
    };
};
//# sourceMappingURL=typert-host.d.ts.map