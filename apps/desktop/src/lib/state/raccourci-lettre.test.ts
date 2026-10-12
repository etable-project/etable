import { describe, expect, it } from "vitest";
import { corrigerLettreGlobale } from "../raccourciLettre";

describe("corrigerLettreGlobale", () => {
  it("remet la lettre affichée pour un ancien raccourci AZERTY", () => {
    expect(corrigerLettreGlobale({ accelerator: "Ctrl+Shift+KeyA", label: "Ctrl + Maj + Q" }).accelerator).toBe("Ctrl+Shift+KeyQ");
  });
  it("ne touche ni un raccourci juste ni une touche qui n'est pas une lettre", () => {
    expect(corrigerLettreGlobale({ accelerator: "Ctrl+Shift+KeyQ", label: "Ctrl + Maj + Q" }).accelerator).toBe("Ctrl+Shift+KeyQ");
    expect(corrigerLettreGlobale({ accelerator: "Ctrl+Alt+F5", label: "Ctrl + Alt + F5" }).accelerator).toBe("Ctrl+Alt+F5");
  });
});