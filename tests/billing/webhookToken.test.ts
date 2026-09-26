import { afterEach, describe, expect, it } from "vitest";
import { isValidWebhookToken, webhookToken } from "../../server/_core/asaas";

const TOKEN = "t".repeat(40);

describe("Asaas webhook token", () => {
  afterEach(() => {
    delete process.env.ASAAS_WEBHOOK_TOKEN;
  });

  it("accepts only the configured token", () => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
    expect(isValidWebhookToken(TOKEN)).toBe(true);
    expect(isValidWebhookToken(TOKEN.slice(1) + "x")).toBe(false);
    expect(isValidWebhookToken(undefined)).toBe(false);
    expect(isValidWebhookToken("")).toBe(false);
  });

  it("rejects everything when no token (or a weak one) is configured", () => {
    expect(isValidWebhookToken("qualquer")).toBe(false);
    process.env.ASAAS_WEBHOOK_TOKEN = "curto";
    expect(webhookToken()).toBeNull();
    expect(isValidWebhookToken("curto")).toBe(false);
  });
});
