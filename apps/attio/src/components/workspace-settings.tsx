import {
  Badge,
  Banner,
  LoadingState,
  Section,
  Typography,
  useAsyncCache,
  useWorkspaceSettings,
  useWorkspaceSettingsForm,
} from "attio/client";
import type { App } from "attio";
import { Suspense } from "react";
import validateConnection from "../server/validate-connection.server";

function ConnectionStatus() {
  const settings = useWorkspaceSettings();
  const hasToken =
    typeof settings.ringee_token === "string" &&
    settings.ringee_token.length > 0;

  if (!hasToken) {
    return (
      <Banner variant="warning">
        Enter your Ringee integration token below to connect this workspace.
      </Banner>
    );
  }

  return (
    <Suspense fallback={<LoadingState />}>
      <ConnectionValidator />
    </Suspense>
  );
}

function ConnectionValidator() {
  const {
    values: { validation },
  } = useAsyncCache({
    validation: [validateConnection],
  });

  if (validation.valid) {
    return (
      <Section title="Connection Status">
        <Badge color="green">Connected</Badge>
        <Typography.Body>
          Workspace: {validation.context.organizationName ?? "Personal"}
        </Typography.Body>
        <Typography.Body>
          User: {validation.context.userName ?? "Unknown"}
        </Typography.Body>
        <Typography.Body>
          Scope:{" "}
          <Badge
            color={
              validation.context.scope === "organization" ? "blue" : "grey"
            }
          >
            {validation.context.scope}
          </Badge>
        </Typography.Body>
      </Section>
    );
  }

  return (
    <Banner variant="error">
      Connection validation failed. Please check your token.
    </Banner>
  );
}

function SettingsForm() {
  const { Form, Section: FormSection, TextInput } = useWorkspaceSettingsForm();

  return (
    <Form>
      <FormSection title="Ringee Connection">
        <TextInput
          label="Integration Token"
          name="ringee_token"
          minLength={10}
          maxLength={2000}
        />
        <TextInput
          label="Ringee API URL"
          name="ringee_api_url"
          maxLength={500}
        />
      </FormSection>
    </Form>
  );
}

function WorkspaceSettingsPage() {
  return (
    <>
      <ConnectionStatus />
      <SettingsForm />
    </>
  );
}

export const workspaceSettings: App.Settings.Workspace = {
  Page: WorkspaceSettingsPage,
};
