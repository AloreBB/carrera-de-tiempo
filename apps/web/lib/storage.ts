const CLIENT_KEY = "cdt_client_id";
const NICK_KEY = "cdt_nickname";
const RECENTS_KEY = "cdt_recents";

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

export function getNickname(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NICK_KEY) ?? "";
}

export function setNickname(nick: string) {
  localStorage.setItem(NICK_KEY, nick);
}

export interface RecentRace {
  code: string;
  raceId: string;
  role: "host" | "player";
  nickname: string;
  at: string;
}

export function getRecents(): RecentRace[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as RecentRace[];
  } catch {
    return [];
  }
}

export function pushRecent(r: RecentRace) {
  const list = getRecents().filter((x) => x.code !== r.code);
  list.unshift(r);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 20)));
}

export function saveSession(data: {
  raceId: string;
  code: string;
  wsToken: string;
  participantId: string;
}) {
  sessionStorage.setItem("cdt_session", JSON.stringify(data));
}

export function loadSession(): {
  raceId: string;
  code: string;
  wsToken: string;
  participantId: string;
} | null {
  try {
    const raw = sessionStorage.getItem("cdt_session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
