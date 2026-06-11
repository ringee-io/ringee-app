import { Settings, type SettingsSchema } from "attio";

const settingsSchema = {
  workspace: {
    ringee_token: Settings.string(),
    ringee_api_url: Settings.string(),
  },
} satisfies SettingsSchema;

export default settingsSchema;
