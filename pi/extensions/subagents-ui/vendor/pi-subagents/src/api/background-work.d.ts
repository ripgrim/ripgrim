export declare const BACKGROUND_WORK_PROTOCOL_VERSION = 1;
export declare const BACKGROUND_WORK_REGISTRY_KEY = "pi-subagents.background-work.v1";
export interface BackgroundWorkItem {
    id: string;
    sessionId: string;
}
export interface BackgroundWorkListContext {
    sessionId: string;
    /** Every form the current session is known by: its file path when it has one, and `getSessionId()`. Includes `sessionId`. */
    sessionIds: readonly string[];
    nowMs: number;
}
export type BackgroundWorkReconcileContext = BackgroundWorkListContext;
export interface BackgroundWorkProvider {
    name: string;
    listActiveWork(context?: BackgroundWorkListContext): readonly BackgroundWorkItem[];
    wakeChannels?: readonly string[];
    reconcile?(context: BackgroundWorkReconcileContext): void;
}
export interface RegisteredBackgroundWorkItem extends BackgroundWorkItem {
    provider: string;
}
export interface BackgroundWorkSnapshot {
    providers: readonly string[];
    items: readonly RegisteredBackgroundWorkItem[];
}
/**
 * Register or replace one process-local background-work provider. The returned
 * disposer only removes this exact registration, so an old extension reload
 * cannot unregister its replacement.
 */
export declare function registerBackgroundWorkProvider(provider: BackgroundWorkProvider): () => void;
export declare function listBackgroundWorkProviders(): readonly BackgroundWorkProvider[];
/** Read validated provider wake channels without reconciling or listing work. */
export declare function listBackgroundWorkWakeChannels(): readonly string[];
/**
 * Reconcile and snapshot active provider work owned by one exact Pi session.
 * `sessionIds` lists that session's identity forms; the first is passed to
 * providers as `sessionId`, and items keyed by any of them are kept.
 */
export declare function snapshotBackgroundWork(sessionIds: readonly string[], nowMs?: number): BackgroundWorkSnapshot;
