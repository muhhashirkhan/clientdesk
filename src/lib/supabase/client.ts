import { createBrowserClient } from "@supabase/ssr";

export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (url.includes("127.0.0.1") || url.includes("localhost")) {
    return {
      storage: {
        from(bucket: string) {
          return {
            async upload(
              path: string,
              file: File,
              options?: { upsert?: boolean; contentType?: string },
            ) {
              void options;
              const form = new FormData();
              form.set("bucket", bucket);
              form.set("path", path);
              form.set("file", file);
              const res = await fetch("/api/local-pg", {
                method: "POST",
                body: form,
              });
              const json = (await res.json()) as {
                data: { path: string } | null;
                error: { message: string } | null;
              };
              return {
                data: json.data,
                error: json.error ? new Error(json.error.message) : null,
              };
            },
            async remove(paths: string[]) {
              const res = await fetch("/api/local-pg", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ op: "storage.remove", bucket, paths }),
              });
              const json = (await res.json()) as {
                data: unknown;
                error: { message: string } | null;
              };
              return {
                data: json.data,
                error: json.error ? new Error(json.error.message) : null,
              };
            },
          };
        },
      },
      async rpc(fn: string, args: Record<string, unknown>) {
        const res = await fetch("/api/local-pg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "rpc", fn, args }),
        });
        const json = (await res.json()) as {
          data: unknown;
          error: { message: string } | null;
        };
        return {
          data: json.data,
          error: json.error ? new Error(json.error.message) : null,
        };
      },
      auth: {
        async verifyOtp({
          token_hash,
        }: {
          token_hash: string;
          type: string;
        }) {
          const res = await fetch("/api/local-pg", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              op: "auth.impersonate",
              email: token_hash,
            }),
          });
          const json = (await res.json()) as {
            error: { message: string } | null;
          };
          return {
            data: {},
            error: json.error ? new Error(json.error.message) : null,
          };
        },
        async exchangeCodeForSession(code: string) {
          const res = await fetch("/api/local-pg", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ op: "auth.impersonate", email: code }),
          });
          const json = (await res.json()) as {
            error: { message: string } | null;
          };
          return {
            data: {},
            error: json.error ? new Error(json.error.message) : null,
          };
        },
        async setSession(tokens: {
          access_token: string;
          refresh_token: string;
        }) {
          void tokens;
          return { data: {}, error: null };
        },
      },
      channel(name: string) {
        void name;
        const ch = {
          on(type: string, filter: unknown, cb: () => void) {
            void type;
            void filter;
            void cb;
            return ch;
          },
          subscribe() {
            return ch;
          },
        };
        return ch;
      },
      removeChannel(ch: unknown) {
        void ch;
        return Promise.resolve("ok");
      },
    } as unknown as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
