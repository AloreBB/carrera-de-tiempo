/** Socket.IO event names — keep client and server in sync */
export const WS_EVENTS = {
  RACE_STATE: "race:state",
  RACE_PARTICIPANT: "race:participant",
  RACE_COUNTDOWN: "race:countdown",
  RACE_STARTED: "race:started",
  RACE_POSITION: "race:position",
  RACE_POSITIONS: "race:positions",
  RACE_FINISHED_ONE: "race:finished_one",
  RACE_COMPLETED: "race:completed",
  RACE_ERROR: "race:error",
  HOST_START: "host:start",
  HOST_APPROVE: "host:approve",
  HOST_FINISH: "host:finish",
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export interface RacePositionPayload {
  lat: number;
  lng: number;
  accuracy?: number;
  t?: number;
}

export interface RacePositionsMap {
  [participantId: string]: {
    lat: number;
    lng: number;
    t: number;
  };
}

export interface HostApprovePayload {
  participantId: string;
  accept: boolean;
}

export interface RaceErrorPayload {
  code: string;
  message: string;
}
