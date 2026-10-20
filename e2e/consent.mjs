/** Accepte l'écran de consentement s'il est affiché. Les tests qui ne se connectent pas n'appellent pas cette fonction. */
export async function acceptConsent(page, timeout = 5000) {
  const gate = page.getByTestId("consent-gate");
  try {
    await gate.waitFor({ state: "visible", timeout });
  } catch {
    return false;
  }
  await page.getByTestId("consent-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.getByTestId("consent-check").check();
  const pad = page.getByTestId("signature-pad");
  const b = await pad.boundingBox();
  if (b) {
    await page.mouse.move(b.x + 24, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + Math.min(b.width - 16, 180), b.y + b.height / 2 - 8, { steps: 10 });
    await page.mouse.up();
  }
  await page.getByTestId("consent-accept").click();
  await gate.waitFor({ state: "hidden", timeout: 8000 });
  return true;
}

export const GEO = {
  geolocation: { latitude: 6.1725, longitude: 1.2314, accuracy: 15 },
  permissions: ["geolocation"],
};
