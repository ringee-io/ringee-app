import {
  Badge,
  Banner,
  DialogList,
  Link,
  LoadingState,
  Section,
  Typography,
  useAsyncCache,
  useQuery,
} from "attio/client";
import { Suspense, useState } from "react";
import getPersonPhonesById from "../graphql/get-person-phones-by-id.graphql";
import getCompanyPhonesById from "../graphql/get-company-phones-by-id.graphql";
import getCallerIds from "../server/get-caller-ids.server";
import prepareCallSession from "../server/prepare-call-session.server";
import checkConnection from "../server/check-connection.server";

function PersonCallDialog({
  recordId,
  object,
}: {
  recordId: string;
  object: string;
}) {
  const { person } = useQuery(getPersonPhonesById, { recordId });

  const name = person?.name?.full_name ?? "Unknown";
  const phones: string[] = person?.phone_numbers ?? [];
  const company: string | null = person?.company?.name ?? null;

  if (phones.length === 0) {
    return (
      <Section title={name}>
        <Banner variant="warning">
          No phone numbers found for this person. Add a phone number to their
          Attio record to call them.
        </Banner>
      </Section>
    );
  }

  return (
    <>
      <Section title={name}>
        {company ? <Typography.Body>{company}</Typography.Body> : null}
        <Typography.Body>Select a number to call:</Typography.Body>
      </Section>
      <Suspense fallback={<LoadingState />}>
        <PhoneListWithCallerIds
          contactName={name}
          phones={phones}
          object={object}
          recordId={recordId}
        />
      </Suspense>
    </>
  );
}

function CompanyCallDialog({
  recordId,
  object,
}: {
  recordId: string;
  object: string;
}) {
  const { company } = useQuery(getCompanyPhonesById, { recordId });

  const name = company?.name ?? "Unknown Company";
  const teamPhones: string[] = (company?.team ?? []).flatMap(
    (member: { phone_numbers?: string[] }) => member.phone_numbers ?? [],
  );
  const uniquePhones = [...new Set(teamPhones)];

  if (uniquePhones.length === 0) {
    return (
      <Section title={name}>
        <Banner variant="warning">
          No phone numbers found for team members of this company. Add phone
          numbers to team members in Attio to call them.
        </Banner>
      </Section>
    );
  }

  return (
    <>
      <Section title={name}>
        <Typography.Body>Select a number to call:</Typography.Body>
      </Section>
      <Suspense fallback={<LoadingState />}>
        <PhoneListWithCallerIds
          contactName={name}
          phones={uniquePhones}
          object={object}
          recordId={recordId}
        />
      </Suspense>
    </>
  );
}

function PhoneListWithCallerIds({
  contactName,
  phones,
  object,
  recordId,
}: {
  contactName: string;
  phones: string[];
  object: string;
  recordId: string;
}) {
  const [calling, setCalling] = useState(false);
  const [callResult, setCallResult] = useState<{ dialerUrl: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const {
    values: { callerIds },
  } = useAsyncCache({
    callerIds: [getCallerIds],
  });

  const defaultCallerId = callerIds.length > 0 ? callerIds[0] : null;

  async function initiateCall(toNumber: string) {
    if (!defaultCallerId) {
      setError(
        "No caller ID available. Configure a phone number in Ringee first.",
      );
      return;
    }

    setCalling(true);
    setError(null);

    try {
      const session = await prepareCallSession({
        toNumber,
        fromNumber: defaultCallerId.phoneNumber,
        recordName: contactName,
        attioRecordId: recordId,
        attioObjectType: object,
      });
      setCallResult({ dialerUrl: session.dialerUrl });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to prepare call";
      setError(message);
      setCalling(false);
    }
  }

  if (callResult) {
    return (
      <Section title="Call Ready">
        <Banner variant="neutral">
          Your call session is ready. Open the Ringee dialer to start the call.
        </Banner>
        <Typography.Body>
          Calling {contactName} from {defaultCallerId?.phoneNumber ?? "unknown"}
        </Typography.Body>
        <Link href={callResult.dialerUrl}>Open Ringee Dialer</Link>
      </Section>
    );
  }

  if (calling) {
    return (
      <Section title="Preparing Call...">
        <LoadingState />
      </Section>
    );
  }

  return (
    <>
      {error ? <Banner variant="error">{error}</Banner> : null}
      {defaultCallerId ? (
        <Section title="Calling From">
          <Badge color="blue">{defaultCallerId.phoneNumber}</Badge>
          {callerIds.length > 1 ? (
            <Typography.Body>
              {callerIds.length - 1} other number(s) available
            </Typography.Body>
          ) : null}
        </Section>
      ) : (
        <Banner variant="warning">
          No caller ID configured in Ringee. Add a verified phone number or buy
          one in Ringee before placing a call.
        </Banner>
      )}
      <PhoneList
        phones={phones}
        onSelect={initiateCall}
        ready={Boolean(defaultCallerId)}
      />
    </>
  );
}

function PhoneList({
  phones,
  onSelect,
  ready,
}: {
  phones: string[];
  onSelect: (phone: string) => void;
  ready: boolean;
}) {
  return (
    <DialogList emptyState={{ text: "No phone numbers available" }}>
      {phones.map((phone) => (
        <DialogList.Item
          key={phone}
          icon="Phone"
          onTrigger={() => onSelect(phone)}
          actionLabel="Call"
          suffix={
            ready ? (
              <Badge color="green">Available</Badge>
            ) : (
              <Badge color="red">Setup required</Badge>
            )
          }
        >
          {phone}
        </DialogList.Item>
      ))}
    </DialogList>
  );
}

function DialogConnectionGuard({ children }: { children: React.ReactNode }) {
  const {
    values: { status },
  } = useAsyncCache({
    status: [checkConnection],
  });

  if (!status.configured) {
    return (
      <Section title="Connection Required">
        <Banner variant="warning">
          {status.message ??
            "Ringee is not configured. Go to Workspace Settings to connect."}
        </Banner>
      </Section>
    );
  }

  return <>{children}</>;
}

function CallDialogContent({
  object,
  recordId,
}: {
  object: string;
  recordId: string;
}) {
  if (object === "people") {
    return <PersonCallDialog recordId={recordId} object={object} />;
  }

  return <CompanyCallDialog recordId={recordId} object={object} />;
}

export default function CallDialog({
  object,
  recordId,
}: {
  object: string;
  recordId: string;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <DialogConnectionGuard>
        <Suspense fallback={<LoadingState />}>
          <CallDialogContent object={object} recordId={recordId} />
        </Suspense>
      </DialogConnectionGuard>
    </Suspense>
  );
}
