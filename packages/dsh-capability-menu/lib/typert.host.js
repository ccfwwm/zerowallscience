import { t as TYPERT_REMOTE } from "./remote-B_oyhhIK.js";
//#region src/typert-host.ts
/** Host and browser use the same codecs; dispatch targets the gateway service. */
const TYPERT = {
	package: TYPERT_REMOTE.package,
	face: "host",
	schemas: [],
	invocations: TYPERT_REMOTE.descriptors.map((descriptor) => ({
		...descriptor,
		service: "capabilityPolicyGateway"
	})),
	model: {
		services: [],
		events: [],
		objects: []
	}
};
//#endregion
export { TYPERT };
