import { randomUUID } from "node:crypto";
import { z } from "zod";

export const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export const idInput = z.string().trim().min(1).max(512);
export const itemInput = z
  .object({
    media_type: z.enum(["movie", "series"]),
    media_id: idInput,
    title: idInput,
    poster: z
      .url()
      .max(2048)
      .refine((value) => new URL(value).protocol === "https:")
      .optional(),
    release_info: z.string().max(100).optional(),
  })
  .strict();
export const listInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(1000).optional(),
  })
  .strict();
export const pageInput = z
  .object({
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const itemView = (row) => ({
  id: row.id,
  list_id: row.list_id,
  media_type: row.media_type,
  media_id: row.media_id,
  title: row.title,
  poster: row.poster,
  release_info: row.release_info,
});

// REST and MCP share the same ownership checks and mutations. No active-session profile.
export function integrationLibrary(db, grant, searchMedia) {
  const ownList = async (tx, id) =>
    (await tx.get(
      "SELECT id,name,description FROM lists WHERE id=? AND user_id=? AND profile_id=?",
      idInput.parse(id),
      grant.user_id,
      grant.profile_id,
    )) ?? fail(404, "List not found in the connected profile.");
  return {
    profile: async () =>
      (await db.get(
        "SELECT id,name FROM profiles WHERE id=? AND user_id=?",
        grant.profile_id,
        grant.user_id,
      )) ?? fail(401, "Connected profile no longer exists."),
    search: async (input) => {
      const { query, type } = z
        .object({
          query: z.string().trim().min(1).max(200),
          type: z.enum(["movie", "series"]).default("series"),
        })
        .strict()
        .parse(input);
      return searchMedia(grant.user_id, query, type);
    },
    lists: async (input = {}) => {
      const { limit, offset } = pageInput.parse(input);
      await db.run(
        "INSERT INTO lists(id,user_id,profile_id,name) VALUES(?,?,?,'Saved') ON CONFLICT DO NOTHING",
        randomUUID(),
        grant.user_id,
        grant.profile_id,
      );
      const rows = await db.all(
        "SELECT id,name,description FROM lists WHERE user_id=? AND profile_id=? ORDER BY created_at,id LIMIT ? OFFSET ?",
        grant.user_id,
        grant.profile_id,
        limit + 1,
        offset,
      );
      return {
        profile_id: grant.profile_id,
        items: rows.slice(0, limit),
        next_offset: rows.length > limit ? offset + limit : null,
      };
    },
    createList: async (input) => {
      const data = listInput.parse(input);
      const id = randomUUID();
      await db.run(
        "INSERT INTO lists(id,user_id,profile_id,name,description) VALUES(?,?,?,?,?)",
        id,
        grant.user_id,
        grant.profile_id,
        data.name,
        data.description ?? null,
      );
      return ownList(db, id);
    },
    items: async (list, input = {}) => {
      await ownList(db, list);
      const { limit, offset } = pageInput.parse(input);
      const rows = await db.all(
        "SELECT id,list_id,media_type,media_id,title,poster,release_info FROM list_items WHERE list_id=? AND user_id=? AND profile_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
        list,
        grant.user_id,
        grant.profile_id,
        limit + 1,
        offset,
      );
      return {
        profile_id: grant.profile_id,
        items: rows.slice(0, limit).map(itemView),
        next_offset: rows.length > limit ? offset + limit : null,
      };
    },
    add: async (list, input) => {
      const item = itemInput.parse(input);
      return db.transaction(async (tx) => {
        await ownList(tx, list);
        await tx.run(
          "INSERT INTO list_items(id,list_id,user_id,profile_id,media_type,media_id,title,poster,release_info) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
          randomUUID(),
          list,
          grant.user_id,
          grant.profile_id,
          item.media_type,
          item.media_id,
          item.title,
          item.poster ?? null,
          item.release_info ?? null,
        );
        return {
          profile_id: grant.profile_id,
          ...itemView(
            await tx.get(
              "SELECT * FROM list_items WHERE list_id=? AND media_type=? AND media_id=? AND COALESCE(video_id,'')=''",
              list,
              item.media_type,
              item.media_id,
            ),
          ),
        };
      });
    },
    remove: async (list, item) => {
      await ownList(db, list);
      await db.run(
        "DELETE FROM list_items WHERE id=? AND list_id=? AND user_id=? AND profile_id=?",
        idInput.parse(item),
        list,
        grant.user_id,
        grant.profile_id,
      );
      return { removed: true, profile_id: grant.profile_id };
    },
  };
}
