import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID } from "crypto";

const DEST = { lat: 40.4168, lng: -3.7038, label: "Puerta del Sol" };

async function seedClient(page: Page, nickname: string) {
  await page.addInitScript(
    ({ nick, id }) => {
      localStorage.setItem("cdt_client_id", id);
      localStorage.setItem("cdt_nickname", nick);
    },
    { nick: nickname, id: randomUUID() },
  );
}

async function mockGeo(context: BrowserContext, lat: number, lng: number) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: lat, longitude: lng });
}

test("home loads and shows CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Carrera de Tiempo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Crear carrera" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Unirme con código" })).toBeVisible();
});

test("full race: create, join, start, finish near destination", async ({
  browser,
}) => {
  const hostId = randomUUID();
  const guestId = randomUUID();

  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  await mockGeo(hostContext, DEST.lat + 0.01, DEST.lng);
  await mockGeo(guestContext, DEST.lat + 0.012, DEST.lng);

  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.addInitScript(
    ({ nick, id }) => {
      localStorage.setItem("cdt_client_id", id);
      localStorage.setItem("cdt_nickname", nick);
    },
    { nick: "HostPilot", id: hostId },
  );
  await guest.addInitScript(
    ({ nick, id }) => {
      localStorage.setItem("cdt_client_id", id);
      localStorage.setItem("cdt_nickname", nick);
    },
    { nick: "GuestPilot", id: guestId },
  );

  // Create via API for reliability of destination, then open lobby in UI
  const createRes = await host.request.post("http://127.0.0.1:3001/api/races", {
    data: {
      nickname: "HostPilot",
      clientId: hostId,
      destLat: DEST.lat,
      destLng: DEST.lng,
      destLabel: DEST.label,
      joinMode: "OPEN",
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();
  const code = created.race.code as string;
  const raceId = created.race.id as string;

  // Persist host session from API response
  await host.goto("/");
  await host.evaluate(
    ({ raceId, code, wsToken, participantId }) => {
      sessionStorage.setItem(
        "cdt_session",
        JSON.stringify({ raceId, code, wsToken, participantId }),
      );
    },
    {
      raceId: created.race.id as string,
      code,
      wsToken: created.wsToken as string,
      participantId: created.participant.id as string,
    },
  );

  // Guest joins via API then both open lobby UI
  const joinRes = await guest.request.post(
    `http://127.0.0.1:3001/api/races/${code}/join`,
    {
      data: {
        nickname: "GuestPilot",
        clientId: guestId,
      },
    },
  );
  expect(joinRes.ok()).toBeTruthy();
  const joined = await joinRes.json();

  await guest.goto("/");
  await guest.evaluate(
    ({ raceId, code, wsToken, participantId }) => {
      sessionStorage.setItem(
        "cdt_session",
        JSON.stringify({ raceId, code, wsToken, participantId }),
      );
    },
    {
      raceId: joined.race.id as string,
      code,
      wsToken: joined.wsToken as string,
      participantId: joined.participant.id as string,
    },
  );

  await host.goto(`/r/${code}`);
  await guest.goto(`/r/${code}`);
  await expect(host.getByTestId("race-code")).toHaveText(code, { timeout: 20_000 });
  await expect(host.getByText("GuestPilot")).toBeVisible({ timeout: 15_000 });
  await expect(guest.getByText("HostPilot")).toBeVisible({ timeout: 15_000 });

  // Start → countdown then racing
  await host.getByTestId("start-race").click();
  await expect(
    host.getByText(/¡Preparados!|¡Carrera!/),
  ).toBeVisible({ timeout: 10_000 });
  await expect(host.getByText("¡Carrera!")).toBeVisible({ timeout: 15_000 });

  await hostContext.setGeolocation({ latitude: DEST.lat, longitude: DEST.lng });
  await guestContext.setGeolocation({ latitude: DEST.lat, longitude: DEST.lng });
  await host.waitForTimeout(2500);

  const fin = await host.request.post(
    `http://127.0.0.1:3001/api/races/${raceId}/finish`,
    { data: { clientId: hostId } },
  );
  expect(fin.ok()).toBeTruthy();

  await host.goto(`/r/${code}`);
  await expect(host.getByRole("heading", { name: "Resultados" })).toBeVisible({
    timeout: 15_000,
  });

  await hostContext.close();
  await guestContext.close();
});

test("create race from UI with my location as dest", async ({ browser }) => {
  const context = await browser.newContext();
  await mockGeo(context, 40.42, -3.7);
  const page = await context.newPage();
  await seedClient(page, "Solo");

  await page.goto("/create");
  await page.getByLabel("Tu apodo").fill("Solo");
  await page.getByRole("button", { name: /Usar mi ubicación/i }).click();
  await expect(page.getByText(/Meta:/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Crear sala" }).click();
  await expect(page.getByTestId("race-code")).toBeVisible({ timeout: 15_000 });
  await context.close();
});
