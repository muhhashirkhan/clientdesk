import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

export const LOCAL_SESSION_COOKIE = "cd-local-session";

type CookieStoreAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: {
      name: string;
      value: string;
      options?: Record<string, unknown>;
    }[],
  ) => void;
};

type SessionUser = {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
};

const globalForPg = globalThis as unknown as {
  __clientdeskPgPromise?: Promise<PGlite>;
};

const STORAGE_ROOT = path.join(process.cwd(), ".pglite-storage");
const DATA_DIR = path.join(process.cwd(), ".pglite-data");

function hashPassword(pw: string): string {
  return crypto.createHash("sha256").update(`clientdesk:${pw}`).digest("hex");
}

export async function getLocalPg(): Promise<PGlite> {
  if (!globalForPg.__clientdeskPgPromise) {
    globalForPg.__clientdeskPgPromise = (async () => {
      await mkdir(DATA_DIR, { recursive: true });
      await mkdir(STORAGE_ROOT, { recursive: true });
      const db = new PGlite(DATA_DIR);
      const checkTable = await db.query<{ exists: boolean }>(
        "select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'companies') as exists",
      );
      if (!checkTable.rows[0]?.exists) {
        await db.exec(`
          do $$ begin
            if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
            if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
            if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
          end $$;
          create schema if not exists auth;
          create schema if not exists storage;
          create table if not exists auth.users(
            id uuid primary key default gen_random_uuid(),
            email text unique not null,
            password_hash text not null default '',
            email_confirmed_at timestamptz default now(),
            raw_user_meta_data jsonb not null default '{}'::jsonb,
            created_at timestamptz not null default now()
          );
          create or replace function auth.uid() returns uuid language sql stable as $fn$
            select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
          $fn$;
          create or replace function auth.jwt() returns jsonb language sql stable as $fn$
            select nullif(current_setting('request.jwt.claims', true), '')::jsonb
          $fn$;
          grant usage on schema public, auth, storage to anon, authenticated, service_role;
          grant execute on all functions in schema auth to anon, authenticated, service_role;
          grant select on auth.users to anon, authenticated, service_role;
          create table if not exists storage.buckets(
            id text primary key,
            name text,
            public boolean,
            file_size_limit bigint
          );
          create table if not exists storage.objects(
            id uuid default gen_random_uuid(),
            bucket_id text,
            name text,
            metadata jsonb
          );
          alter table storage.objects enable row level security;
          grant select, insert, delete on storage.objects to authenticated, service_role;
        `);

        const migrationDir = path.join(process.cwd(), "supabase", "migrations");
        const files = (await readdir(migrationDir))
          .filter((f) => f.endsWith(".sql"))
          .sort();
        for (const file of files) {
          const sql = await readFile(path.join(migrationDir, file), "utf8");
          await db.exec(sql);
        }

        // Seed default Aiquor admin user so existing workflows work immediately
        const defaultAdminId = "11111111-1111-4111-8111-111111111111";
        await db.query(
          `insert into auth.users(id, email, password_hash, email_confirmed_at, raw_user_meta_data)
           values ($1, $2, $3, now(), '{"full_name":"Aiquor Admin"}'::jsonb)
           on conflict (email) do nothing`,
          [defaultAdminId, "admin@aiquor.test", hashPassword("Obsidian2026!")],
        );
        await db.query(
          `update public.profiles set role = 'admin', active_company_id = '00000000-0000-4000-8000-000000000001'::uuid where id = $1`,
          [defaultAdminId],
        );
        await db.query(
          `update public.companies set onboarding_completed = true where id = '00000000-0000-4000-8000-000000000001'::uuid`,
        );
      }
      return db;
    })();
  }
  return globalForPg.__clientdeskPgPromise;
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      if (k === "deadline" || k === "due_date") {
        out[k] = v.toISOString().slice(0, 10);
      } else {
        out[k] = v.toISOString();
      }
    } else if (typeof v === "bigint") {
      out[k] = Number(v);
    } else if (k === "size" && typeof v === "string" && /^\d+$/.test(v)) {
      out[k] = Number(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function ident(name: string): string {
  if (name.includes(".")) {
    const [tbl, col] = name.split(".");
    return `${ident(tbl)}.${ident(col)}`;
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

type FilterClause = {
  build: (params: unknown[]) => string;
};

class LocalQueryBuilder<T = Record<string, unknown>> implements PromiseLike<{
  data: T | null;
  error: { message: string; code?: string } | null;
  count?: number | null;
}> {
  private table: string;
  private getSessionUser: () => Promise<SessionUser | null>;
  private serviceRole: boolean;
  private op: "select" | "insert" | "update" | "delete" = "select";
  private selectCols = "*";
  private wantCount = false;
  private isHead = false;
  private joinProjects = false;
  private payload: unknown = null;
  private returningCols: string | null = null;
  private filters: FilterClause[] = [];
  private orders: string[] = [];
  private limitVal: number | null = null;
  private offsetVal: number | null = null;
  private cardinality: "many" | "single" | "maybeSingle" = "many";

  constructor(
    table: string,
    getSessionUser: () => Promise<SessionUser | null>,
    serviceRole: boolean,
  ) {
    this.table = table;
    this.getSessionUser = getSessionUser;
    this.serviceRole = serviceRole;
  }

  select(
    columns = "*",
    options?: { count?: "exact"; head?: boolean },
  ): this {
    if (this.op === "select") {
      if (columns.includes("projects!inner")) {
        this.joinProjects = true;
        const cleaned = columns
          .replace(/,?projects!inner\([^)]*\)/g, "")
          .trim()
          .replace(/^,|,$/g, "");
        this.selectCols = cleaned
          ? cleaned
              .split(",")
              .map((c) => `${ident(this.table)}.${ident(c.trim())}`)
              .join(", ")
          : `${ident(this.table)}.*`;
      } else if (columns.trim() === "*") {
        this.selectCols = `${ident(this.table)}.*`;
      } else {
        this.selectCols = columns
          .split(",")
          .map((c) => `${ident(this.table)}.${ident(c.trim())}`)
          .join(", ");
      }
      if (options?.count === "exact") this.wantCount = true;
      if (options?.head) this.isHead = true;
    } else {
      this.returningCols =
        columns.trim() === "*"
          ? "*"
          : columns
              .split(",")
              .map((c) => ident(c.trim()))
              .join(", ");
    }
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.op = "insert";
    this.payload = values;
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.op = "update";
    this.payload = values;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  private colRef(col: string): string {
    if (col.includes(".")) return ident(col);
    return `${ident(this.table)}.${ident(col)}`;
  }

  eq(col: string, val: unknown): this {
    const ref = this.colRef(col);
    this.filters.push({
      build: (params) => {
        params.push(val);
        return `${ref} = $${params.length}`;
      },
    });
    return this;
  }

  neq(col: string, val: unknown): this {
    const ref = this.colRef(col);
    this.filters.push({
      build: (params) => {
        params.push(val);
        return `${ref} <> $${params.length}`;
      },
    });
    return this;
  }

  gt(col: string, val: unknown): this {
    const ref = this.colRef(col);
    this.filters.push({
      build: (params) => {
        params.push(val);
        return `${ref} > $${params.length}`;
      },
    });
    return this;
  }

  gte(col: string, val: unknown): this {
    const ref = this.colRef(col);
    this.filters.push({
      build: (params) => {
        params.push(val);
        return `${ref} >= $${params.length}`;
      },
    });
    return this;
  }

  lt(col: string, val: unknown): this {
    const ref = this.colRef(col);
    this.filters.push({
      build: (params) => {
        params.push(val);
        return `${ref} < $${params.length}`;
      },
    });
    return this;
  }

  lte(col: string, val: unknown): this {
    const ref = this.colRef(col);
    this.filters.push({
      build: (params) => {
        params.push(val);
        return `${ref} <= $${params.length}`;
      },
    });
    return this;
  }

  ilike(col: string, pattern: string): this {
    const ref = this.colRef(col);
    this.filters.push({
      build: (params) => {
        params.push(pattern);
        return `${ref} ilike $${params.length}`;
      },
    });
    return this;
  }

  is(col: string, val: null | boolean): this {
    const ref = this.colRef(col);
    this.filters.push({
      build: () => {
        if (val === null) return `${ref} is null`;
        return `${ref} is ${val ? "true" : "false"}`;
      },
    });
    return this;
  }

  not(col: string, op: string, val: unknown): this {
    const ref = this.colRef(col);
    this.filters.push({
      build: (params) => {
        if (op === "is" && val === null) return `${ref} is not null`;
        params.push(val);
        return `not (${ref} = $${params.length})`;
      },
    });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    const ref = this.colRef(col);
    this.filters.push({
      build: (params) => {
        if (!vals.length) return "false";
        const placeholders = vals.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `${ref} in (${placeholders.join(", ")})`;
      },
    });
    return this;
  }

  order(
    col: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): this {
    const asc = options?.ascending !== false ? "asc" : "desc";
    const nulls =
      options?.nullsFirst !== undefined
        ? options.nullsFirst
          ? " nulls first"
          : " nulls last"
        : "";
    this.orders.push(`${this.colRef(col)} ${asc}${nulls}`);
    return this;
  }

  limit(n: number): this {
    this.limitVal = n;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetVal = Math.max(0, from);
    this.limitVal = Math.max(0, to - from + 1);
    return this;
  }

  single(): this {
    this.cardinality = "single";
    return this;
  }

  maybeSingle(): this {
    this.cardinality = "maybeSingle";
    return this;
  }

  async execute(): Promise<{
    data: T | null;
    error: { message: string; code?: string } | null;
    count?: number | null;
  }> {
    const db = await getLocalPg();
    const user = await this.getSessionUser();

    try {
      return await db.transaction(async (tx) => {
        if (this.serviceRole) {
          await tx.exec("set local role service_role");
        } else if (user) {
          await tx.exec("set local role authenticated");
          await tx.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({ sub: user.id, email: user.email }),
          ]);
        } else {
          await tx.exec("set local role anon");
          await tx.query(
            "select set_config('request.jwt.claims', '{}', true)",
          );
        }

        const params: unknown[] = [];
        const buildWhere = () => {
          if (!this.filters.length) return "";
          return (
            " where " + this.filters.map((f) => f.build(params)).join(" and ")
          );
        };

        if (this.op === "select") {
          const fromSql = `from public.${ident(this.table)}${
            this.joinProjects
              ? ` inner join public."projects" "projects" on "projects"."id" = public.${ident(this.table)}."project_id"`
              : ""
          }`;
          const whereSql = buildWhere();

          let totalCount: number | null = null;
          if (this.wantCount) {
            const countRes = await tx.query<{ count: string }>(
              `select count(*)::text as count ${fromSql}${whereSql}`,
              params,
            );
            totalCount = Number(countRes.rows[0]?.count ?? 0);
          }

          if (this.isHead) {
            return { data: null, error: null, count: totalCount };
          }

          const orderSql = this.orders.length
            ? ` order by ${this.orders.join(", ")}`
            : "";
          const limitSql =
            this.limitVal !== null ? ` limit ${Number(this.limitVal)}` : "";
          const offsetSql =
            this.offsetVal !== null ? ` offset ${Number(this.offsetVal)}` : "";

          const sql = `select ${this.selectCols} ${fromSql}${whereSql}${orderSql}${limitSql}${offsetSql}`;
          const res = await tx.query<Record<string, unknown>>(sql, params);
          const rows = res.rows.map(normalizeRow);

          if (this.cardinality === "single") {
            if (rows.length !== 1) {
              return {
                data: null,
                error: {
                  message: "JSON object requested, multiple (or no) rows returned",
                  code: "PGRST116",
                },
                count: totalCount,
              };
            }
            return { data: rows[0] as unknown as T, error: null, count: totalCount };
          }
          if (this.cardinality === "maybeSingle") {
            return {
              data: (rows[0] ?? null) as unknown as T,
              error: null,
              count: totalCount,
            };
          }
          return { data: rows as unknown as T, error: null, count: totalCount };
        }

        if (this.op === "insert") {
          const items = Array.isArray(this.payload)
            ? this.payload
            : [this.payload as Record<string, unknown>];
          const keys = Object.keys(items[0] ?? {});
          const colNames = keys.map(ident).join(", ");
          const valueGroups = items.map((item) => {
            const group = keys.map((k) => {
              params.push(item[k]);
              return `$${params.length}`;
            });
            return `(${group.join(", ")})`;
          });
          const returningSql = this.returningCols
            ? ` returning ${this.returningCols}`
            : "";
          const sql = `insert into public.${ident(this.table)} (${colNames}) values ${valueGroups.join(", ")}${returningSql}`;
          const res = await tx.query<Record<string, unknown>>(sql, params);
          const rows = res.rows.map(normalizeRow);
          if (this.cardinality === "single") {
            if (rows.length !== 1) {
              return {
                data: null,
                error: { message: "No row returned", code: "PGRST116" },
              };
            }
            return { data: rows[0] as unknown as T, error: null };
          }
          if (this.cardinality === "maybeSingle") {
            return { data: (rows[0] ?? null) as unknown as T, error: null };
          }
          return { data: rows as unknown as T, error: null };
        }

        if (this.op === "update") {
          const item = this.payload as Record<string, unknown>;
          const keys = Object.keys(item);
          const sets = keys.map((k) => {
            params.push(item[k]);
            return `${ident(k)} = $${params.length}`;
          });
          const whereSql = buildWhere();
          const returningSql = this.returningCols
            ? ` returning ${this.returningCols}`
            : "";
          const sql = `update public.${ident(this.table)} set ${sets.join(", ")}${whereSql}${returningSql}`;
          const res = await tx.query<Record<string, unknown>>(sql, params);
          const rows = res.rows.map(normalizeRow);
          if (this.cardinality === "single") {
            if (rows.length !== 1) {
              return {
                data: null,
                error: { message: "No row updated", code: "PGRST116" },
              };
            }
            return { data: rows[0] as unknown as T, error: null };
          }
          if (this.cardinality === "maybeSingle") {
            return { data: (rows[0] ?? null) as unknown as T, error: null };
          }
          return { data: rows as unknown as T, error: null };
        }

        // delete
        const whereSql = buildWhere();
        const returningSql = this.returningCols
          ? ` returning ${this.returningCols}`
          : "";
        const sql = `delete from public.${ident(this.table)}${whereSql}${returningSql}`;
        const res = await tx.query<Record<string, unknown>>(sql, params);
        const rows = res.rows.map(normalizeRow);
        if (this.cardinality === "single") {
          if (rows.length !== 1) {
            return {
              data: null,
              error: { message: "No row deleted", code: "PGRST116" },
            };
          }
          return { data: rows[0] as unknown as T, error: null };
        }
        return { data: rows as unknown as T, error: null };
      });
    } catch (err) {
      const e = err as { message?: string; code?: string };
      return {
        data: null,
        error: {
          message: e?.message || "Database error",
          code: e?.code,
        },
      };
    }
  }

  then<TResult1 = {
    data: T | null;
    error: { message: string; code?: string } | null;
    count?: number | null;
  }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: T | null;
          error: { message: string; code?: string } | null;
          count?: number | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function createLocalSupabaseClient(
  cookiesAdapter?: CookieStoreAdapter,
  options?: { serviceRole?: boolean },
) {
  const serviceRole = options?.serviceRole ?? false;

  async function getSessionUser(): Promise<SessionUser | null> {
    if (!cookiesAdapter) return null;
    const raw = cookiesAdapter
      .getAll()
      .find((c) => c.name === LOCAL_SESSION_COOKIE)?.value;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { id?: string; email?: string };
      if (!parsed.id) return null;
      const db = await getLocalPg();
      const res = await db.query<{
        id: string;
        email: string;
        raw_user_meta_data: Record<string, unknown>;
      }>(
        "select id, email, raw_user_meta_data from auth.users where id = $1",
        [parsed.id],
      );
      const u = res.rows[0];
      if (!u) return null;
      return {
        id: u.id,
        email: u.email,
        user_metadata: u.raw_user_meta_data,
      };
    } catch {
      return null;
    }
  }

  function setSessionCookie(user: { id: string; email: string } | null) {
    if (!cookiesAdapter) return;
    if (!user) {
      cookiesAdapter.setAll([
        {
          name: LOCAL_SESSION_COOKIE,
          value: "",
          options: { path: "/", maxAge: 0 },
        },
      ]);
      return;
    }
    cookiesAdapter.setAll([
      {
        name: LOCAL_SESSION_COOKIE,
        value: JSON.stringify({ id: user.id, email: user.email }),
        options: {
          path: "/",
          httpOnly: false,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7,
        },
      },
    ]);
  }

  return {
    from<T = Record<string, unknown>>(table: string) {
      return new LocalQueryBuilder<T>(table, getSessionUser, serviceRole);
    },
    async rpc<T = unknown>(
      fnName: string,
      args: Record<string, unknown> = {},
    ): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
      const db = await getLocalPg();
      const user = await getSessionUser();
      try {
        return await db.transaction(async (tx) => {
          if (serviceRole) {
            await tx.exec("set local role service_role");
          } else if (user) {
            await tx.exec("set local role authenticated");
            await tx.query(
              "select set_config('request.jwt.claims', $1, true)",
              [JSON.stringify({ sub: user.id, email: user.email })],
            );
          } else {
            await tx.exec("set local role anon");
            await tx.query(
              "select set_config('request.jwt.claims', '{}', true)",
            );
          }
          const keys = Object.keys(args);
          const params: unknown[] = [];
          const namedArgs = keys.map((k) => {
            params.push(args[k]);
            return `${ident(k)} => $${params.length}`;
          });
          const sql = `select public.${ident(fnName)}(${namedArgs.join(", ")}) as result`;
          const res = await tx.query<{ result: T }>(sql, params);
          return { data: res.rows[0]?.result ?? null, error: null };
        });
      } catch (err) {
        const e = err as { message?: string; code?: string };
        return {
          data: null,
          error: { message: e?.message || "RPC failed", code: e?.code },
        };
      }
    },
    auth: {
      async getUser() {
        const user = await getSessionUser();
        return {
          data: { user },
          error: user ? null : { message: "Not signed in" },
        };
      },
      async signInWithPassword({
        email,
        password,
      }: {
        email: string;
        password: string;
      }) {
        const db = await getLocalPg();
        const cleanEmail = email.trim().toLowerCase();
        const res = await db.query<{
          id: string;
          email: string;
          password_hash: string;
        }>("select id, email, password_hash from auth.users where email = $1", [
          cleanEmail,
        ]);
        const user = res.rows[0];
        if (!user || user.password_hash !== hashPassword(password)) {
          return {
            data: { user: null, session: null },
            error: new Error("Invalid login credentials"),
          };
        }
        setSessionCookie({ id: user.id, email: user.email });
        return {
          data: {
            user: { id: user.id, email: user.email },
            session: { access_token: user.id },
          },
          error: null,
        };
      },
      async signUp({
        email,
        password,
        options,
      }: {
        email: string;
        password: string;
        options?: { data?: Record<string, unknown> };
      }) {
        const db = await getLocalPg();
        const cleanEmail = email.trim().toLowerCase();
        const existing = await db.query<{ id: string }>(
          "select id from auth.users where email = $1",
          [cleanEmail],
        );
        if (existing.rows.length > 0) {
          return {
            data: { user: null, session: null },
            error: new Error("An account with this email already exists."),
          };
        }
        const meta = JSON.stringify(options?.data ?? {});
        const inserted = await db.query<{ id: string; email: string }>(
          `insert into auth.users(email, password_hash, email_confirmed_at, raw_user_meta_data)
           values ($1, $2, now(), $3::jsonb)
           returning id, email`,
          [cleanEmail, hashPassword(password), meta],
        );
        const user = inserted.rows[0];
        setSessionCookie({ id: user.id, email: user.email });
        return {
          data: {
            user: { id: user.id, email: user.email },
            session: { access_token: user.id },
          },
          error: null,
        };
      },
      async signOut() {
        setSessionCookie(null);
        return { error: null };
      },
      async updateUser({
        password,
        data,
      }: {
        password?: string;
        data?: Record<string, unknown>;
      }) {
        const user = await getSessionUser();
        if (!user) return { data: { user: null }, error: new Error("Not signed in") };
        const db = await getLocalPg();
        if (password) {
          await db.query(
            "update auth.users set password_hash = $1 where id = $2",
            [hashPassword(password), user.id],
          );
        }
        if (data) {
          await db.query(
            "update auth.users set raw_user_meta_data = raw_user_meta_data || $1::jsonb where id = $2",
            [JSON.stringify(data), user.id],
          );
        }
        return { data: { user }, error: null };
      },
      async resetPasswordForEmail(email: string, options?: unknown) {
        void email;
        void options;
        return { data: {}, error: null };
      },
      async signInWithOtp(opts: unknown) {
        void opts;
        return { data: {}, error: null };
      },
      async verifyOtp({
        token_hash,
        type,
      }: {
        token_hash: string;
        type: string;
      }) {
        void type;
        const db = await getLocalPg();
        const cleanEmail = token_hash.trim().toLowerCase();
        const found = await db.query<{ id: string; email: string }>(
          "select id, email from auth.users where email = $1 or id::text = $1",
          [cleanEmail],
        );
        if (!found.rows[0]) {
          return { data: { user: null }, error: new Error("Invalid token") };
        }
        const u = found.rows[0];
        await db.query(
          "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1",
          [u.id],
        );
        setSessionCookie({ id: u.id, email: u.email });
        return { data: { user: u }, error: null };
      },
      admin: {
        async inviteUserByEmail(
          email: string,
          options?: { redirectTo?: string },
        ) {
          void options;
          const db = await getLocalPg();
          const cleanEmail = email.trim().toLowerCase();
          const existing = await db.query<{ id: string; email: string }>(
            "select id, email from auth.users where email = $1",
            [cleanEmail],
          );
          if (existing.rows[0]) {
            return {
              data: { user: existing.rows[0] },
              error: null,
            };
          }
          const inserted = await db.query<{ id: string; email: string }>(
            `insert into auth.users(email, password_hash, email_confirmed_at, raw_user_meta_data)
             values ($1, $2, now(), '{}'::jsonb)
             returning id, email`,
            [cleanEmail, hashPassword("InvitedUser2026!")],
          );
          return {
            data: { user: inserted.rows[0] },
            error: null,
          };
        },
      },
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(
            storagePath: string,
            file: File | Blob | Buffer | Uint8Array,
            options?: { contentType?: string; upsert?: boolean },
          ) {
            const db = await getLocalPg();
            const user = await getSessionUser();
            if (!user && !serviceRole) {
              return { data: null, error: new Error("Not signed in") };
            }
            try {
              const buf =
                file instanceof Buffer || file instanceof Uint8Array
                  ? Buffer.from(file)
                  : Buffer.from(await (file as Blob).arrayBuffer());
              const mime =
                options?.contentType ||
                (file instanceof File && file.type) ||
                "application/octet-stream";

              await db.transaction(async (tx) => {
                if (serviceRole) {
                  await tx.exec("set local role service_role");
                } else {
                  await tx.exec("set local role authenticated");
                  await tx.query(
                    "select set_config('request.jwt.claims', $1, true)",
                    [JSON.stringify({ sub: user!.id, email: user!.email })],
                  );
                }
                await tx.query(
                  `insert into storage.objects(bucket_id, name, metadata)
                   values ($1, $2, $3::jsonb)`,
                  [
                    bucket,
                    storagePath,
                    JSON.stringify({ size: buf.byteLength, mimetype: mime }),
                  ],
                );
              });

              const diskTarget = path.join(STORAGE_ROOT, bucket, storagePath);
              await mkdir(path.dirname(diskTarget), { recursive: true });
              await writeFile(diskTarget, buf);
              return { data: { path: storagePath }, error: null };
            } catch (err) {
              return {
                data: null,
                error:
                  err instanceof Error ? err : new Error("Storage upload failed"),
              };
            }
          },
          async remove(paths: string[]) {
            const db = await getLocalPg();
            const user = await getSessionUser();
            if (!user && !serviceRole) {
              return { data: null, error: new Error("Not signed in") };
            }
            try {
              await db.transaction(async (tx) => {
                if (serviceRole) {
                  await tx.exec("set local role service_role");
                } else {
                  await tx.exec("set local role authenticated");
                  await tx.query(
                    "select set_config('request.jwt.claims', $1, true)",
                    [JSON.stringify({ sub: user!.id, email: user!.email })],
                  );
                }
                await tx.query(
                  `delete from storage.objects where bucket_id = $1 and name = any($2::text[])`,
                  [bucket, paths],
                );
              });
              for (const p of paths) {
                const diskTarget = path.join(STORAGE_ROOT, bucket, p);
                await rm(diskTarget, { force: true });
              }
              return { data: paths.map((name) => ({ name })), error: null };
            } catch (err) {
              return {
                data: null,
                error:
                  err instanceof Error ? err : new Error("Storage remove failed"),
              };
            }
          },
          async createSignedUrl(
            storagePath: string,
            _expiresIn: number,
            options?: { download?: string | boolean },
          ) {
            const db = await getLocalPg();
            const user = await getSessionUser();
            if (!user && !serviceRole) {
              return { data: null, error: new Error("Not signed in") };
            }
            try {
              const found = await db.transaction(async (tx) => {
                if (serviceRole) {
                  await tx.exec("set local role service_role");
                } else {
                  await tx.exec("set local role authenticated");
                  await tx.query(
                    "select set_config('request.jwt.claims', $1, true)",
                    [JSON.stringify({ sub: user!.id, email: user!.email })],
                  );
                }
                const res = await tx.query<{ name: string }>(
                  `select name from storage.objects where bucket_id = $1 and name = $2`,
                  [bucket, storagePath],
                );
                return res.rows[0];
              });
              if (!found) {
                return { data: null, error: new Error("Object not found") };
              }
              const dlName =
                typeof options?.download === "string"
                  ? options.download
                  : path.basename(storagePath);
              const baseUrl =
                process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3013";
              const signedUrl = `${baseUrl.replace(/\/$/, "")}/api/local-pg?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(storagePath)}&download=${encodeURIComponent(dlName)}`;
              return { data: { signedUrl }, error: null };
            } catch (err) {
              return {
                data: null,
                error:
                  err instanceof Error
                    ? err
                    : new Error("Could not sign storage URL"),
              };
            }
          },
        };
      },
    },
  };
}
