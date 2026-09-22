import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { apiRequest } from "@/api/client";
import { IntegrationSettings } from "./integration-settings";
vi.mock("@/api/client", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <IntegrationSettings />
    </QueryClientProvider>,
  );
  return client;
}
const connections = {
  items: [],
  api_url: "https://wadi.test/api/v1",
  mcp_url: "https://wadi.test/api/mcp",
};
it("requires an explicit profile, creates scoped keys and forgets the one-time secret", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/profiles")
      return {
        items: [
          { id: "profile-1", name: "Main" },
          { id: "profile-2", name: "Other" },
        ],
      };
    if (options?.method === "POST") return { key: "one-time-secret" };
    return connections;
  });
  const user = userEvent.setup(),
    client = setup();
  await screen.findByRole("option", { name: "Main" });
  await user.type(screen.getByLabelText("Key name"), "My automation");
  expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "API key profile" }),
    "profile-2",
  );
  await user.click(screen.getByRole("checkbox"));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "API key expiry" }),
    "30",
  );
  await user.click(screen.getByRole("button", { name: "Create key" }));
  expect(
    await screen.findByRole("textbox", { name: "New API key" }),
  ).toHaveValue("one-time-secret");
  expect(apiRequest).toHaveBeenCalledWith("/api/account/integrations", {
    method: "POST",
    body: {
      name: "My automation",
      profile_id: "profile-2",
      scope: "library:read library:write",
      expires_in_days: 30,
    },
  });
  await user.click(screen.getByRole("button", { name: "Done" }));
  expect(
    screen.queryByRole("textbox", { name: "New API key" }),
  ).not.toBeInTheDocument();
  expect(
    JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    ),
  ).not.toContain("one-time-secret");
  expect(client.getMutationCache().getAll()).toHaveLength(0);
});
it("requires confirmation to revoke a connection and keeps errors visible", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/profiles") return { items: [] };
    if (options?.method === "DELETE") throw new Error("Could not revoke");
    return {
      ...connections,
      items: [
        {
          id: "id",
          name: "Test app",
          kind: "oauth",
          profile_name: "Main",
          scopes: "library:read",
          expires_at: "2099-01-01T00:00:00.000Z",
          last_used_at: null,
        },
      ],
    };
  });
  const user = userEvent.setup();
  setup();
  await user.click(
    await screen.findByRole("button", { name: "Revoke Test app" }),
  );
  expect(apiRequest).not.toHaveBeenCalledWith(
    "/api/account/integrations/id",
    expect.anything(),
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Revoke Test app" }));
  await user.click(screen.getByRole("button", { name: "Revoke access" }));
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("alert")
        .some((node) => node.textContent?.includes("Could not revoke")),
    ).toBe(true),
  );
});
