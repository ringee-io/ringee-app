import type {App} from "attio"
import {showDialog} from "attio/client"
import CallDialog from "../../components/call-dialog"

export const callWithRingee: App.Record.Action = {
    id: "call-with-ringee",
    label: "Call with Ringee",
    icon: "Phone",
    onTrigger: async ({recordId, object}) => {
        await showDialog({
            title: "Call with Ringee",
            Dialog: () => <CallDialog recordId={recordId} object={object} />,
        })
    },
    objects: ["people", "companies"],
}
