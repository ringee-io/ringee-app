import type {App} from "attio"
import {callWithRingee} from "./record/actions/call-with-ringee"
import {ringeeActivityWidget} from "./record/widgets/ringee-activity"
import {workspaceSettings} from "./components/workspace-settings"
import "./app.settings"

export const app: App = {
    record: {
        actions: [callWithRingee],
        bulkActions: [],
        widgets: [ringeeActivityWidget],
    },
    callRecording: {
        insight: {
            textActions: [],
        },
        summary: {
            textActions: [],
        },
        transcript: {
            textActions: [],
        },
    },
    settings: {
        workspace: workspaceSettings,
    },
}
