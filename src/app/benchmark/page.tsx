import Image from "next/image";
import Link from "next/link";

const results = [
  { name: "Baseline v1", devAttacks: "0/5", devBenign: "6/6", heldoutAttacks: "0/5", heldoutBenign: "6/6", outcome: "Misses the smoke-set attacks" },
  { name: "Evolved minimal", devAttacks: "5/5", devBenign: "6/6", heldoutAttacks: "5/5", heldoutBenign: "6/6", outcome: "Passes the checked-in smoke gate" },
  { name: "Evolved strict", devAttacks: "5/5", devBenign: "3/6", heldoutAttacks: "5/5", heldoutBenign: "3/6", outcome: "Rejected: blocks benign writes" },
];

export const metadata = {
  title: "Guardrail smoke evaluation · ctrlz",
  description: "Checked-in smoke evaluation of CtrlZ baseline and evolved guardrail configurations.",
};

export default function BenchmarkPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-12 text-white sm:px-10">
      <nav className="mb-12 flex items-center justify-between text-sm text-white/70">
        <Link href="/" className="font-semibold text-white">ctrlz</Link>
        <Link href="/console" className="underline underline-offset-4">Open console</Link>
      </nav>

      <header className="mb-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Evaluation evidence</p>
        <h1 className="mb-4 text-4xl font-semibold tracking-tight sm:text-5xl">Guardrail smoke evaluation</h1>
        <p className="max-w-3xl text-base leading-7 text-white/70">
          A reproducible comparison of the checked-in baseline and two deterministic evolved rule sets.
          This compares CtrlZ guardrail configurations, not CtrlZ with other applications.
        </p>
      </header>

      <figure className="mb-10 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <Image src="/guardrail-smoke.svg" width={960} height={560} unoptimized alt="Baseline blocks 0 of 5 attacks and keeps 6 of 6 benign writes; minimal blocks 5 of 5 and keeps 6 of 6; strict blocks 5 of 5 and keeps 3 of 6." className="h-auto w-full" />
        <figcaption className="px-5 pb-4 text-sm text-white/55">Five attack fixtures and six benign fixtures per split.</figcaption>
      </figure>

      <div className="mb-10 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <caption className="sr-only">Smoke fixture results by guardrail configuration</caption>
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/65">
            <tr>
              <th className="px-4 py-3">Rule set</th><th className="px-4 py-3">Dev attacks blocked</th><th className="px-4 py-3">Dev benign kept</th><th className="px-4 py-3">Held-out attacks blocked</th><th className="px-4 py-3">Held-out benign kept</th><th className="px-4 py-3">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => (
              <tr key={row.name} className="border-t border-white/10 text-white/80">
                <th scope="row" className="px-4 py-4 font-medium text-white">{row.name}</th>
                <td className="px-4 py-4">{row.devAttacks}</td><td className="px-4 py-4">{row.devBenign}</td>
                <td className="px-4 py-4">{row.heldoutAttacks}</td><td className="px-4 py-4">{row.heldoutBenign}</td>
                <td className="px-4 py-4">{row.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="max-w-3xl space-y-4 text-sm leading-6 text-white/70">
        <h2 className="text-xl font-semibold text-white">Method and limits</h2>
        <p>
          The results use <code className="text-fuchsia-100">EVAL_DEV</code> and <code className="text-fuchsia-100">EVAL_HELDOUT</code> in <code className="text-fuchsia-100">src/lib/scenario.ts</code>, scored by <code className="text-fuchsia-100">scoreSplit</code>. The minimal and strict rows use deterministic heuristic proposals plus baseline v1. Expected scores are pinned in <code className="text-fuchsia-100">tests/unit/guardrails.test.ts</code>.
        </p>
        <p>
          This is a small smoke evaluation, not a production attack study, application-to-application benchmark, or evidence of broad generalization. Fixture definitions are checked into the repository. In Atlas mode, the held-out runtime collection is separate and read by a grader principal; the source fixtures themselves are not secret test data.
        </p>
        <p>
          Reproduce the fixture scoring with <code className="text-fuchsia-100">pnpm exec vitest run tests/unit/guardrails.test.ts</code>. Live evolution runs may use an LLM proposal and embeddings, so judges should read the per-run denominators and verdicts in the console.
        </p>
        <p><Link href="https://github.com/manvendersingh21/ctrlz/blob/main/docs/BENCHMARK.md" className="text-fuchsia-200 underline underline-offset-4">Source notes and full methodology on GitHub</Link></p>
      </section>
    </main>
  );
}
