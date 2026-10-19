/** DSH 0.2.1-alpha.3+ api-gateway intercept 需要 signal 与未 dispose 的 owner Peer。 */
export function ownerPeer() {
	return {
		signal: new AbortController().signal,
		principal: { kind: "owner" },
	};
}

export function gatewayCall(handler, endpoint, args = {}) {
	return handler(endpoint, { args }, new AbortController().signal, ownerPeer());
}
