import { basePolicy, configuredProviders } from "./_ai.ts";
import type { ApiHandler } from "./_types.ts";

const handler: ApiHandler = (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    service: "zence-r2",
    time: new Date().toISOString(),
    config: {
      ai: configuredProviders(),
      aiCustom: basePolicy(),
    },
  });
};

export default handler;
