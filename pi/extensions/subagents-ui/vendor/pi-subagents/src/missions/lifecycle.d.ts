import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Details } from "../shared/types.ts";
import type { MissionRecord, MissionStoreConfig, MissionStoreLocation } from "./types.ts";
export declare const MISSION_BINDING_FILE = "mission.json";
export interface MissionLaunchParams {
    missionId?: string;
    mission?: unknown;
    task?: string;
    tasks?: Array<{
        task?: string;
    }>;
    chain?: Array<{
        task?: string;
        parallel?: Array<{
            task?: string;
        }> | {
            task?: string;
        };
    }>;
}
export interface MissionLaunchBinding {
    missionId: string;
    location: MissionStoreLocation;
    /** True when the launch made the mission without a `mission` or `missionId` request. */
    autoCreated: boolean;
    announceInContent?: boolean;
}
export declare function prepareMissionLaunch(input: {
    params: MissionLaunchParams;
    projectRoot: string;
    config?: MissionStoreConfig;
    ownerSessionId?: string;
}): MissionLaunchBinding | undefined;
/** The first unaccepted acceptance status among child results, else the first status found. */
export declare function missionAcceptanceStatus(results: unknown): string | undefined;
/**
 * The status of a mission whose runs all finished successfully. Every path that
 * completes a mission from run state goes through here.
 */
export declare function finishedMissionStatus(record: MissionRecord, autoCreated: boolean, runAcceptance: ReadonlyArray<{
    runId: string;
    status: string | undefined;
}>): "completed" | "waiting";
export declare function writeMissionAsyncBinding(asyncDir: string, binding: MissionLaunchBinding): void;
export declare function attachMissionToLaunchResult(input: {
    binding: MissionLaunchBinding;
    result: AgentToolResult<Details>;
}): AgentToolResult<Details>;
export declare function readMissionBinding(asyncDir: string): MissionLaunchBinding | undefined;
export declare function syncMissionFromAsyncCompletion(value: unknown): MissionRecord | undefined;
