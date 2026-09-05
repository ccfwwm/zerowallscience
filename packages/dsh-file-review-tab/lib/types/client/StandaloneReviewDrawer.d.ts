/** Standalone review shell: the only module allowed to take over the Host details column. */
import type { RefObject } from 'react';
import type { ReviewContentProps } from './ReviewContent.tsx';
export interface StandaloneReviewDrawerProps extends ReviewContentProps {
    readonly anchorRef: RefObject<HTMLElement>;
    readonly trigger: HTMLButtonElement | null;
    readonly onClose: () => void;
}
/** Fixed/mobile Drawer plus desktop details-column ownership and resize behavior. */
export declare function StandaloneReviewDrawer({ anchorRef, trigger, onClose, ...contentProps }: StandaloneReviewDrawerProps): import("react").JSX.Element;
//# sourceMappingURL=StandaloneReviewDrawer.d.ts.map