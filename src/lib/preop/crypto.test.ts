import { describe, expect, it } from "vitest";
import { generateDeviceKey, seal, sealBackup, unseal, unsealBackup } from "./crypto";

describe("dossier encryption", () => {
  it("round-trips with the device key, and the ciphertext doesn't contain the data", async () => {
    const key = await generateDeviceKey();
    expect(key.extractable).toBe(false);
    const sealed = await seal(key, { initials: "DM", note: "Apixaban" });
    expect(atob(sealed.data)).not.toContain("Apixaban");
    expect(await unseal(key, sealed)).toEqual({ initials: "DM", note: "Apixaban" });
  });

  it("another key can't read it", async () => {
    const sealed = await seal(await generateDeviceKey(), { a: 1 });
    await expect(unseal(await generateDeviceKey(), sealed)).rejects.toThrow();
  });

  it("backups open only with the right passphrase", async () => {
    const backup = await sealBackup("correct horse battery", [{ id: "d1" }], 1000);
    expect(await unsealBackup("correct horse battery", backup)).toEqual([{ id: "d1" }]);
    await expect(unsealBackup("wrong passphrase!!", backup)).rejects.toThrow("Mot de passe incorrect");
    await expect(sealBackup("short", [])).rejects.toThrow("trop court");
  });
});
