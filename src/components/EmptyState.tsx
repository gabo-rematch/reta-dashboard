export function EmptyState() {
  return (
    <section className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/80 p-5 text-base leading-7 text-zinc-200 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
      No injections logged yet. Run{" "}
      <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-amber-200">
        reta log injection --clicks 4
      </code>{" "}
      from the CLI.
    </section>
  );
}
