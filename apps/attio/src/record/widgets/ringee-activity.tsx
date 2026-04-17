import {
    Badge,
    Banner,
    DialogList,
    LoadingState,
    Section,
    Table,
    Typography,
    useAsyncCache,
    useQuery,
} from "attio/client"
import {showDialog} from "attio/client"
import type {App} from "attio"
import {Suspense} from "react"
import getPersonPhonesById from "../../graphql/get-person-phones-by-id.graphql"
import getCompanyPhonesById from "../../graphql/get-company-phones-by-id.graphql"
import getCallHistory from "../../server/get-call-history.server"
import checkConnection from "../../server/check-connection.server"
import CallDialog from "../../components/call-dialog"
import type {CallHistoryEntry} from "../../utils/types"

function formatDuration(seconds: number | null): string {
    if (seconds === null || seconds === 0) return "—"
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatDate(isoDate: string | null): string {
    if (!isoDate) return "—"
    const date = new Date(isoDate)
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const hour = String(date.getHours()).padStart(2, "0")
    const min = String(date.getMinutes()).padStart(2, "0")
    return `${month}/${day} ${hour}:${min}`
}

function outcomeBadgeColor(
    outcome: string | null
): "green" | "blue" | "yellow" | "red" | "grey" | "orange" {
    switch (outcome) {
        case "meeting_booked":
        case "sale":
            return "green"
        case "interested":
        case "follow_up":
            return "blue"
        case "not_interested":
            return "orange"
        case "no_answer":
        case "voicemail":
            return "yellow"
        case "wrong_number":
            return "red"
        default:
            return "grey"
    }
}

function directionBadge(direction: string | null) {
    if (direction === "inbound") return <Badge color="blue">IN</Badge>
    if (direction === "outbound") return <Badge color="green">OUT</Badge>
    return <Badge color="grey">—</Badge>
}

function CallHistoryTable({calls}: {calls: CallHistoryEntry[]}) {
    if (calls.length === 0) {
        return (
            <Section title="Call History">
                <Typography.Body>No calls found for this record.</Typography.Body>
            </Section>
        )
    }

    return (
        <Section title={`Recent Calls (${calls.length})`}>
            <Table>
                <Table.Header>
                    <Table.HeaderCell>Date</Table.HeaderCell>
                    <Table.HeaderCell>Dir</Table.HeaderCell>
                    <Table.HeaderCell>Duration</Table.HeaderCell>
                    <Table.HeaderCell>Outcome</Table.HeaderCell>
                </Table.Header>
                <Table.Body>
                    {calls.map((call) => (
                        <Table.Row key={call.id}>
                            <Table.Cell>{formatDate(call.startedAt)}</Table.Cell>
                            <Table.Cell>{directionBadge(call.direction)}</Table.Cell>
                            <Table.Cell>{formatDuration(call.durationSeconds)}</Table.Cell>
                            <Table.Cell>
                                {call.outcome ? (
                                    <Badge color={outcomeBadgeColor(call.outcome)}>
                                        {call.outcome.replace(/_/g, " ")}
                                    </Badge>
                                ) : (
                                    <Badge color="grey">{call.status}</Badge>
                                )}
                            </Table.Cell>
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table>
        </Section>
    )
}

function RecordingsList({calls}: {calls: CallHistoryEntry[]}) {
    const withRecording = calls.filter((c) => c.recordingUrl)
    if (withRecording.length === 0) return null

    return (
        <Section title="Recordings">
            <DialogList emptyState={{text: "No recordings"}}>
                {withRecording.map((call) => (
                    <DialogList.Item
                        key={call.id}
                        icon="Play"
                        onTrigger={() => {}}
                        actionLabel="View"
                    >
                        {formatDate(call.startedAt)} — {formatDuration(call.durationSeconds)}
                    </DialogList.Item>
                ))}
            </DialogList>
        </Section>
    )
}

function ConnectionGuard({children}: {children: React.ReactNode}) {
    const {
        values: {status},
    } = useAsyncCache({
        status: [checkConnection],
    })

    if (!status.configured) {
        return (
            <Section title="Ringee">
                <Banner variant="warning">
                    {status.message ??
                        "Ringee is not configured. Go to Workspace Settings to connect."}
                </Banner>
            </Section>
        )
    }

    return <>{children}</>
}

function PersonActivity({recordId, object}: {recordId: string; object: string}) {
    const {person} = useQuery(getPersonPhonesById, {recordId})
    const phones: string[] = person?.phone_numbers ?? []
    const name = person?.name?.full_name ?? "Unknown"

    if (phones.length === 0) {
        return (
            <Section title="Ringee">
                <Typography.Body>No phone numbers on this record.</Typography.Body>
            </Section>
        )
    }

    return (
        <Suspense fallback={<LoadingState />}>
            <ActivityContent
                phones={phones}
                contactName={name}
                object={object}
                recordId={recordId}
            />
        </Suspense>
    )
}

function CompanyActivity({recordId, object}: {recordId: string; object: string}) {
    const {company} = useQuery(getCompanyPhonesById, {recordId})
    const teamPhones: string[] = (company?.team ?? []).flatMap(
        (member: {phone_numbers?: string[]}) => member.phone_numbers ?? []
    )
    const phones = [...new Set(teamPhones)]
    const name = company?.name ?? "Unknown"

    if (phones.length === 0) {
        return (
            <Section title="Ringee">
                <Typography.Body>No phone numbers found for team members.</Typography.Body>
            </Section>
        )
    }

    return (
        <Suspense fallback={<LoadingState />}>
            <ActivityContent
                phones={phones}
                contactName={name}
                object={object}
                recordId={recordId}
            />
        </Suspense>
    )
}

function ActivityContent({
    phones,
    contactName,
    object,
    recordId,
}: {
    phones: string[]
    contactName: string
    object: string
    recordId: string
}) {
    const {
        values: {calls},
    } = useAsyncCache({
        calls: [getCallHistory, {phoneNumbers: phones, limit: 10}],
    })

    return (
        <>
            <Section title="Ringee">
                <Badge color="green">Connected</Badge>
                <Typography.Body>{phones.length} phone number(s) on record</Typography.Body>
            </Section>

            <CallHistoryTable calls={calls} />
            <RecordingsList calls={calls} />

            <Section title="Quick Actions">
                <DialogList emptyState={{text: "No actions available"}}>
                    <DialogList.Item
                        icon="Phone"
                        onTrigger={() => {
                            showDialog({
                                title: "Call with Ringee",
                                Dialog: () => <CallDialog object={object} recordId={recordId} />,
                            })
                        }}
                        actionLabel="Call"
                    >
                        Call {contactName}
                    </DialogList.Item>
                </DialogList>
            </Section>
        </>
    )
}

function RingeeActivityWidget({recordId, object}: {recordId: string; object: string}) {
    return (
        <Suspense fallback={<LoadingState />}>
            <ConnectionGuard>
                <Suspense fallback={<LoadingState />}>
                    {object === "people" ? (
                        <PersonActivity recordId={recordId} object={object} />
                    ) : (
                        <CompanyActivity recordId={recordId} object={object} />
                    )}
                </Suspense>
            </ConnectionGuard>
        </Suspense>
    )
}

export const ringeeActivityWidget: App.Record.Widget = {
    id: "ringee-activity",
    label: "Ringee Activity",
    Widget: ({recordId, object}) => <RingeeActivityWidget recordId={recordId} object={object} />,
    objects: ["people", "companies"],
}
