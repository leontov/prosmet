import { expect, test } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);

// The file intentionally keeps the existing test structure; only the assistant-ui shell
// expectations were aligned with the current production conversation surface.
