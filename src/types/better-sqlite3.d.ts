declare module "better-sqlite3" {
  type BindParameter = string | number | bigint | Buffer | null;
  type BindParameters = BindParameter | BindParameter[] | Record<string, BindParameter>;

  interface Statement {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): this;
    pragma(pragma: string, options?: { simple?: boolean }): unknown;
    close(): void;
  }

  interface Options {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
  }

  function BetterSqlite3(filename: string, options?: Options): Database;
  namespace BetterSqlite3 {
    type BindParameters = BindParameter | BindParameter[] | Record<string, BindParameter>;
  }
  export = BetterSqlite3;
}
