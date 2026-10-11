import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Fingerprint, GitBranch, RotateCcw, ShieldCheck, Sparkles, Workflow, Zap } from "lucide-react";
import { instrumentSerif } from "./fonts";
import Analyzer from "./analyzer";
import Scenarios from "./scenarios";
import { HeroFx, Reveal, SignalStrip } from "./fx";
import styles from "./landing.module.css";

const steps = [
  ["Detect", "When configured, Raindrop records turn and risk signals; otherwise the demo keeps a local mirror."],
  ["Trace", "Follow the causal chain from the poisoned message through every dependent action."],
  ["Quarantine", "Use an atomic database transaction where supported; show the non-atomic sequential fallback otherwise."],
  ["Compensate", "Record resumable compensation outcomes; provider effects depend on the configured runtime mode."],
  ["Replay", "Compare a clean plan with prior effects and show whether each effect was kept or deduplicated."],
  ["Harden", "Gate guardrail candidates on development and held-out smoke evaluations; inspect each run's scores."],
];
const features = [
  [GitBranch, "Causal lineage graph", "See exactly which actions trusted a poisoned memory, all the way downstream."],
  [RotateCcw, "Resumable compensation", "Compensation outcomes are checkpointed. Stripe test refunds require a configured test key; email and payment recalls are simulated intents."],
  [Workflow, "Clean replay with dedupe", "Compare replay plans with prior effects; the incident shows which effects were kept or deduplicated."],
  [ShieldCheck, "Eval-gated guardrails", "A candidate must improve attack blocking without reducing benign examples versus baseline on the available splits."],
  [Zap, "Raindrop integration", "When configured, Raindrop records diagnostics and replay verification signals on their source events."],
  [Fingerprint, "Separate grader principal", "Atlas can grade a held-out smoke set through a separate database and read-only principal; scores appear with each run."],
];
const attacks = [
  ["Guest contractor in #travel", "A shared-channel guest slips in a new card and private receipt address. The concierge treats it like Alice’s memory.", "The demo traces the booking, records a compensation outcome, creates a simulated correction-email intent and shows replay evidence."],
  ["Unverified vendor email", "A message asks the finance agent to route an invoice to a replacement bank account.", "The demo records a simulated payment-recall intent, restores the known vendor details and holds the attempted memory write."],
  ["Customer support transcript", "A customer tells a support copilot to remember an account recovery secret supplied by someone else.", "ctrlz finds every later action that depended on the secret and quarantines the chain."],
];
const useCases = [
  ["Travel concierge", ...attacks[0]],
  ["Finance / AP", ...attacks[1]],
  ["Customer support", ...attacks[2]],
  ["Sales ops", "Spoofed discount approval", "A forwarded thread claims a key account’s renewal discount was already approved, and the sales agent saves it as fact.", "ctrlz traces every quote that cited the discount, voids them and re-prices from the verified contract."],
  ["Internal copilots", "Poisoned wiki snippet", "A pasted doc tells an engineering copilot that production deploys no longer need a second reviewer.", "ctrlz quarantines the policy memory, revokes the approvals that relied on it and tightens the write guardrail."],
];
const faqs = [
  ["What is memory poisoning?", "An agent can store misleading information as long-term memory and later use it to make real decisions. ctrlz traces and reverses the actions that relied on that memory."],
  ["How does rollback avoid duplicate effects?", "The demo plans a clean replay first and compares semantic keys before deciding which prior effects to keep or deduplicate. Inspect the incident evidence; external outcomes depend on configured providers."],
  ["What’s the eval gate?", "Proposed guardrails are scored on development and, when available, held-out smoke data. A candidate must improve attack blocking without reducing benign examples versus baseline."],
  ["Does it need an LLM?", "No. The demo works with deterministic heuristic fallbacks. Optional model and embedding providers can improve extraction and retrieval quality."],
  ["How does Raindrop fit in?", "When configured, Raindrop receives turn and risk signals and carries thumbs-down feedback through root-cause blame and one-click rollback. Without it, events are mirrored locally; replay verification is shown in the incident evidence."],
  ["What does it run on?", "MongoDB Atlas provides vector and text search, causal graph traversal, transactions and unique indexes. Voyage AI and Raindrop integrate as optional services."],
];

export default function Landing() {
  return <main className={`${styles.page} ${instrumentSerif.variable}`}>
    <div className={styles.ambient} aria-hidden="true" />
    <header className={styles.nav}><Link href="/" className={styles.brand}><span className={styles.brandMark} aria-hidden="true">↶</span>ctrlz<span className={styles.brandKey} aria-hidden="true">⌘Z</span></Link><nav aria-label="Main navigation"><a href="#how">How it works</a><a href="#features">Features</a><a href="#demo">Demo</a><a href="/benchmark">Benchmark</a><a href="#faq">FAQ</a></nav><Link className={styles.navCta} href="/console">Open console <ArrowUpRight size={15}/></Link></header>
    <section className={`${styles.hero} ${styles.wrap}`}>
      <HeroFx />
      <div className={styles.heroCopy}><p className={styles.eyebrow}><span className={styles.pulse}/> AI AGENT MEMORY SECURITY</p><h1>Your agent remembered a lie. <em>Undo it.</em></h1><p className={styles.lede}>When poisoned memory turns into real-world actions, trace what it touched, reverse the damage, and replay the request cleanly.</p><div className={styles.actions}><Link className={styles.buttonLight} href="/console">Launch the live demo <ArrowUpRight size={16}/></Link><a className={styles.buttonQuiet} href="#how">See how it works <ArrowDown size={15}/></a></div><div className={styles.heroNote}><ShieldCheck size={15}/> Built for the moment an agent gets it wrong.</div></div>
      <div className={styles.demoWrap} id="demo"><div className={styles.demoLabel}><span className={styles.liveDot}/> TRY IT <span>Memory risk analyzer</span></div><Analyzer /></div>
      <div className={styles.heroOrb} aria-hidden="true"><div className={styles.orbCore}><span>ctrl<br/>z</span></div><i/><b/><small/></div>
    </section>
    <section className={styles.tech}><span>STACK · OPTIONAL PROVIDERS</span><b>◉ MongoDB Atlas</b><b>Voyage AI</b><b>Raindrop</b><b>NVIDIA NIM</b><b>Next.js</b></section>
    <section className={`${styles.section} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>01 — CONTEXT</p><h2>One attack. <em>Many ways in.</em></h2><p>Memory poisoning looks different in every workflow. These are illustrative threat patterns; only the travel and finance agents run in this demo.</p></Reveal><Reveal delay={0.08}><Scenarios scenarios={useCases.map(([label, title, attack, response]) => ({ label, title, attack, response }))}/></Reveal></section>
    <section className={`${styles.compare} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>02 — THE DIFFERENCE</p><h2>Undo the damage.<br/><em>Keep the good.</em></h2><p>Effects are simulated unless Stripe test mode is configured. With a Stripe test key, flight charges and refunds create test objects; no real money moves. Hotel, email, and payment-recall effects are simulated ledger entries.</p></Reveal><div className={styles.compareGrid}><article className={styles.panelBad}><span className={styles.panelTag}>WITHOUT CTRLZ · SCENARIO</span><h3>The lie becomes reality.</h3><ul><li><span>−</span> Flight charged to attacker’s Visa</li><li><span>−</span> Receipt leaked to an outsider</li><li><span>−</span> $1,240 gone, no clean path back</li></ul><div className={styles.panelTotal}>Memory stays poisoned <span>●</span></div></article><div className={styles.compareArrow}><ArrowRight/></div><article className={styles.panelGood}><span className={styles.panelTag}>WITH CTRLZ · SIMULATION</span><h3>Review the recovery evidence.</h3><ul><li><Check/> Flight compensation outcome shown in the ledger</li><li><Check/> Correction-email intent recorded; no email sent</li><li><Check/> Replay evidence identifies kept or deduplicated effects</li><li><Check/> Hotel kept only when replay terms match</li></ul><div className={styles.panelTotal}>Replay status shown per incident <span>●</span></div></article></div></section>
    <section id="how" className={`${styles.section} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>03 — THE RECOVERY LOOP</p><h2>From first signal<br/>to <em>clean slate.</em></h2><p>Quarantine uses a MongoDB transaction on replica-set deployments; standalone development mode falls back to sequential writes and is not atomic.</p></Reveal><SignalStrip /><div className={styles.timeline}>{steps.map(([title, description], i) => <article className={styles.step} key={title}><span className={styles.stepNum}>0{i + 1}</span><div><h3>{title}</h3><p>{description}</p></div><span className={styles.stepMark}>{i === 0 ? "MODE" : "↗"}</span></article>)}</div></section>
    <section id="features" className={`${styles.section} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>04 — BUILT FOR THE BLAST RADIUS</p><h2>Precise by <em>design.</em></h2></Reveal><div className={styles.featureGrid}>{features.map(([Icon, title, body], i) => <Reveal as="article" delay={(i % 3) * 0.07} className={styles.feature} key={title as string}><div className={styles.featureIcon}><Icon size={19} aria-hidden="true"/></div><h3>{title as string}</h3><p>{body as string}</p></Reveal>)}</div></section>
    <section className={`${styles.stats} ${styles.wrap}`} aria-label="Evidence and runtime modes"><div><strong>Per run</strong><span>Trace evidence</span><small>Inspect incident-specific nodes and timings in the console</small></div><div><strong>Mode aware</strong><span>Tool effects</span><small>Stripe test mode when configured; hotel, email, and recall are simulated</small></div><div><strong>Smoke eval</strong><span>Guardrail gate</span><small>Hand-authored dev and held-out examples; scores include denominators</small></div><div><strong>Per incident</strong><span>Replay evidence</span><small>Check the incident’s replay status and matching event signals</small></div></section>
    <section className={`${styles.section} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>05 — WHAT IT CATCHES</p><h2>Small message.<br/><em>Long shadow.</em></h2></Reveal><div className={styles.quoteGrid}>{attacks.map(([role, example]) => <blockquote className={styles.quote} key={role}><span>“</span><p>{example}</p><footer><i/> {role}</footer></blockquote>)}</div></section>
    <section id="faq" className={`${styles.section} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>06 — GOOD QUESTIONS</p><h2>Frequently <em>asked.</em></h2></Reveal><div className={styles.faq}>{faqs.map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
    <section className={`${styles.finalCta} ${styles.wrap}`}><Sparkles size={20}/><p className={styles.eyebrow}>WHEN MEMORY GOES WRONG</p><h2>Give your agents<br/>a way <em>back.</em></h2><Link className={styles.buttonLight} href="/console">Open the live console <ArrowUpRight size={16}/></Link></section>
    <footer className={`${styles.footer} ${styles.wrap}`}><Link href="/" className={styles.brand}><span className={styles.brandMark} aria-hidden="true">↶</span>ctrlz</Link><span>Ctrl+Z for AI agent memory.</span><div><Link href="/console">Console</Link><Link href="/benchmark">Benchmark</Link><a href="#how">How it works</a><a href="#faq">FAQ</a></div><small>© 2026 ctrlz</small></footer>
  </main>;
}
