import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { integrationAuth } from "./integration-auth.js";
import {
  integrationLibrary,
  idInput,
  itemInput,
  listInput,
  pageInput,
  fail,
} from "./integration-library.js";

export function addIntegrations(app, options) {
  const { authenticate, management, resource } = integrationAuth(app, options);
  const library = (req) =>
    integrationLibrary(options.db, req.integration, options.searchMedia);
  const requireWrite = (req) => {
    if (!req.integration.scopes.split(" ").includes("library:write"))
      fail(403, "This connection is read-only.");
  };
  app.use("/api/v1", authenticate("api"));
  // Never accept an override that looks like it changes the credential's profile.
  app.use("/api/v1", (req, _res, next) => {
    if (
      req.query.profile_id !== undefined ||
      req.body?.profile_id !== undefined ||
      req.headers["x-profile-id"] !== undefined
    )
      fail(
        400,
        "Profile is fixed by this credential; create a separate key for another profile.",
      );
    next();
  });
  app.get("/api/v1/profile", async (req, res) =>
    res.json(await library(req).profile()),
  );
  app.get("/api/v1/search", async (req, res) =>
    res.json(await library(req).search(req.query)),
  );
  app.get("/api/v1/lists", async (req, res) =>
    res.json(await library(req).lists(req.query)),
  );
  app.post("/api/v1/lists", async (req, res) => {
    requireWrite(req);
    res.status(201).json(await library(req).createList(req.body));
  });
  app.get("/api/v1/lists/:id/items", async (req, res) =>
    res.json(await library(req).items(req.params.id, req.query)),
  );
  app.post("/api/v1/lists/:id/items", async (req, res) => {
    requireWrite(req);
    res.status(201).json(await library(req).add(req.params.id, req.body));
  });
  app.delete("/api/v1/lists/:id/items/:item", async (req, res) => {
    requireWrite(req);
    res.json(await library(req).remove(req.params.id, req.params.item));
  });
  app.use("/api/v1", (_req, res) =>
    res.status(404).json({ error: "Unknown API endpoint." }),
  );
  app.use("/api/mcp", authenticate(resource));
  app.post("/api/mcp", async (req, res) => {
    const server = new McpServer({ name: "wadi", version: "1.0.0" });
    const lib = library(req);
    const tool = (name, description, schema, write, destructive, handler) => {
      if (write && !req.integration.scopes.split(" ").includes("library:write"))
        return;
      server.registerTool(
        name,
        {
          description,
          inputSchema: schema,
          annotations: {
            readOnlyHint: !write,
            destructiveHint: destructive,
            idempotentHint: name !== "create_list",
            openWorldHint: name === "search_media",
          },
        },
        async (input) => {
          try {
            return {
              content: [
                { type: "text", text: JSON.stringify(await handler(input)) },
              ],
            };
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text:
                    error instanceof z.ZodError
                      ? "Invalid tool arguments."
                      : error.status
                        ? error.message
                        : "Request failed. Please try again.",
                },
              ],
            };
          }
        },
      );
    };
    tool(
      "get_profile",
      "Get the profile this connection can access. All tools are restricted to this profile.",
      z.object({}).strict(),
      false,
      false,
      lib.profile,
    );
    tool(
      "search_media",
      "Search installed Wadi catalogs for shows or movies. Use the returned media_id, media_type and title to add a result to a list.",
      z
        .object({
          query: z.string().min(1).max(200),
          type: z.enum(["movie", "series"]).default("series"),
        })
        .strict(),
      false,
      false,
      lib.search,
    );
    tool(
      "list_lists",
      "List saved lists in the connected profile, including Saved. Returns next_offset for pagination.",
      pageInput,
      false,
      false,
      lib.lists,
    );
    tool(
      "list_items",
      "Read a saved list. Returns next_offset for pagination.",
      pageInput.extend({ list_id: idInput }).strict(),
      false,
      false,
      ({ list_id, ...page }) => lib.items(list_id, page),
    );
    tool(
      "create_list",
      "Create a named list in the connected profile.",
      listInput,
      true,
      false,
      lib.createList,
    );
    tool(
      "add_item",
      "Add a movie or show to a list in the connected profile. Repeating the same media ID does not create duplicates.",
      itemInput.extend({ list_id: idInput }).strict(),
      true,
      false,
      ({ list_id, ...item }) => lib.add(list_id, item),
    );
    tool(
      "remove_item",
      "Remove a saved item from a list in the connected profile.",
      z.object({ list_id: idInput, item_id: idInput }).strict(),
      true,
      true,
      ({ list_id, item_id }) => lib.remove(list_id, item_id),
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.all("/api/mcp", (_req, res) =>
    res
      .set("Allow", "POST")
      .status(405)
      .json({
        error:
          "Use Streamable HTTP POST. This server does not maintain SSE sessions.",
      }),
  );
  return management;
}
