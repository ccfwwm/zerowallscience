/**
 * Client typert contribution: mounted by the browser plugin through
 * ctx.remote.$mount(contribution). The descriptors mirror the host manifest,
 * so both ends validate the same wire.
 */
import { DESCRIPTORS } from "./descriptors.js";

export const TYPERT_REMOTE = {
  package: "dsh-ssh-ops",
  descriptors: DESCRIPTORS
};

export { TYPERT_REMOTE as default };
