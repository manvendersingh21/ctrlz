import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Fingerprint, GitBranch, RotateCcw, ShieldCheck, Sparkles, Workflow, Zap } from "lucide-react";
import { instrumentSerif } from "./fonts";
import Analyzer from "./analyzer";
import Scenarios from "./scenarios";
import { HeroFx, Reveal, SignalStrip } from "./fx";
import styles from "./landing.module.css";

const steps = [
  ["Detect", "Raindrop watches every turn and flags risky actions while they happen."],
  ["Trace", "Follow the causal chain from the poisoned message through every dependent action."],
  ["Quarantine", "Isolate tainted memories and actions together in one transaction."],
  ["Compensate", "Undo side effects newest first, exactly once, with resumable checkpoints."],
  ["Replay", "Run requests cleanly. Semantic dedupe keeps effects the clean replay reproduces."],
  ["Harden", "Ship a tighter guardrail only when it passes a held-out eval it never saw."],
];
const features = [
  [GitBranch, "Causal lineage graph", "See exactly which actions trusted a poisoned memory, all the way downstream."],
  [RotateCcw, "Exactly-once compensation", "Refunds, recalls and correction emails resume safely after a crash."],
  [Workflow, "Clean replay with dedupe", "Replay requests without repeating side effects the clean run would still make."],
  [ShieldCheck, "Eval-gated guardrails", "A candidate ships only when it blocks more attacks and keeps every benign write."],
  [Zap, "Raindrop, end to end", "Detect, diagnose and verify remediation on the exact event under review."],
  [Fingerprint, "Separate grader principal", "Held-out evaluation runs against a separate database and Atlas principal."],
];
const attacks = [
  ["Guest contractor in #travel", "A shared-channel guest slips in a new card and private receipt address. The concierge treats it like Alice’s memory.", "ctrlz traces the booking, refunds the flight, sends a correction and replays with Alice’s verified card."],
  ["Unverified vendor email", "A message asks the finance agent to route an invoice to a replacement bank account.", "ctrlz recalls the payment, restores the known vendor details and holds the attempted memory write."],
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
  ["How does rollback avoid double-charging?", "A clean replay is planned first. Semantic idempotency keys and unique indexes ensure identical effects are kept or deduped, while compensations run exactly once."],
  ["What’s the eval gate?", "Proposed guardrails are scored on development and held-out data. A candidate ships only if it blocks more attacks while preserving every benign write."],
  ["Does it need an LLM?", "No. The demo works with deterministic heuristic fallbacks. Optional model and embedding providers can improve extraction and retrieval quality."],
  ["How does Raindrop fit in?", "Raindrop monitors turns and risky actions, then carries thumbs-down feedback through root-cause blame and one-click rollback. Verification lands on the event it judges."],
  ["What does it run on?", "MongoDB Atlas provides vector and text search, causal graph traversal, transactions and unique indexes. Voyage AI and Raindrop integrate as optional services."],
];

export default function Landing() {
  return <main className={`${styles.page} ${instrumentSerif.variable}`}>
    <div className={styles.ambient} aria-hidden="true" />
    <header className={styles.nav}><Link href="/" className={styles.brand}><span className={styles.brandMark} aria-hidden="true">↶</span>ctrlz<span className={styles.brandKey} aria-hidden="true">⌘Z</span></Link><nav aria-label="Main navigation"><a href="#how">How it works</a><a href="#features">Features</a><a href="#demo">Demo</a><a href="#faq">FAQ</a></nav><Link className={styles.navCta} href="/console">Open console <ArrowUpRight size={15}/></Link></header>
    <section className={`${styles.hero} ${styles.wrap}`}>
      <HeroFx />
      <div className={styles.heroCopy}><p className={styles.eyebrow}><span className={styles.pulse}/> AI AGENT MEMORY SECURITY</p><h1>Your agent remembered a lie. <em>Undo it.</em></h1><p className={styles.lede}>When poisoned memory turns into real-world actions, trace what it touched, reverse the damage, and replay the request cleanly.</p><div className={styles.actions}><Link className={styles.buttonLight} href="/console">Launch the live demo <ArrowUpRight size={16}/></Link><a className={styles.buttonQuiet} href="#how">See how it works <ArrowDown size={15}/></a></div><div className={styles.heroNote}><ShieldCheck size={15}/> Built for the moment an agent gets it wrong.</div></div>
      <div className={styles.demoWrap} id="demo"><div className={styles.demoLabel}><span className={styles.liveDot}/> TRY IT <span>Memory risk analyzer</span></div><Analyzer /></div>
      <div className={styles.heroOrb} aria-hidden="true"><div className={styles.orbCore}><span>ctrl<br/>z</span></div><i/><b/><small/></div>
    </section>
    <section className={styles.tech}><span>BUILT ON</span><b>◉ MongoDB Atlas</b><b>Voyage AI</b><b>Raindrop</b><b>NVIDIA NIM</b><b>Next.js</b></section>
    <section className={`${styles.section} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>01 — CONTEXT</p><h2>One attack. <em>Many ways in.</em></h2><p>Memory poisoning looks different in every workflow. The blast radius is what matters.</p></Reveal><Reveal delay={0.08}><Scenarios scenarios={useCases.map(([label, title, attack, response]) => ({ label, title, attack, response }))}/></Reveal></section>
    <section className={`${styles.compare} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>02 — THE DIFFERENCE</p><h2>Undo the damage.<br/><em>Keep the good.</em></h2></Reveal><div className={styles.compareGrid}><article className={styles.panelBad}><span className={styles.panelTag}>WITHOUT CTRLZ</span><h3>The lie becomes reality.</h3><ul><li><span>−</span> Flight charged to attacker’s Visa</li><li><span>−</span> Receipt leaked to an outsider</li><li><span>−</span> $1,240 gone, no clean path back</li></ul><div className={styles.panelTotal}>Memory stays poisoned <span>●</span></div></article><div className={styles.compareArrow}><ArrowRight/></div><article className={styles.panelGood}><span className={styles.panelTag}>WITH CTRLZ</span><h3>Rollback with precision.</h3><ul><li><Check/> Flight refunded exactly once</li><li><Check/> Correction email sent</li><li><Check/> Rebooked on Alice’s Amex</li><li><Check/> Hotel kept — not churned</li></ul><div className={styles.panelTotal}>Clean replay verified <span>●</span></div></article></div></section>
    <section id="how" className={`${styles.section} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>03 — THE RECOVERY LOOP</p><h2>From first signal<br/>to <em>clean slate.</em></h2></Reveal><SignalStrip /><div className={styles.timeline}>{steps.map(([title, description], i) => <article className={styles.step} key={title}><span className={styles.stepNum}>0{i + 1}</span><div><h3>{title}</h3><p>{description}</p></div><span className={styles.stepMark}>{i === 0 ? "LIVE" : "↗"}</span></article>)}</div></section>
    <section id="features" className={`${styles.section} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>04 — BUILT FOR THE BLAST RADIUS</p><h2>Precise by <em>design.</em></h2></Reveal><div className={styles.featureGrid}>{features.map(([Icon, title, body], i) => <Reveal as="article" delay={(i % 3) * 0.07} className={styles.feature} key={title as string}><div className={styles.featureIcon}><Icon size={19} aria-hidden="true"/></div><h3>{title as string}</h3><p>{body as string}</p></Reveal>)}</div></section>
    <section className={`${styles.stats} ${styles.wrap}`}><div><strong>7</strong><span>nodes traced</span><small>in 12 ms</small></div><div><strong>0</strong><span>duplicate effects</span><small>exactly once</small></div><div><strong>5/5</strong><span>attacks blocked</span><small>6/6 benign kept · held-out</small></div><div><strong>153</strong><span>tests</span><small>and one clean replay</small></div></section>
    <section className={`${styles.section} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>05 — WHAT IT CATCHES</p><h2>Small message.<br/><em>Long shadow.</em></h2></Reveal><div className={styles.quoteGrid}>{attacks.map(([role, example]) => <blockquote className={styles.quote} key={role}><span>“</span><p>{example}</p><footer><i/> {role}</footer></blockquote>)}</div></section>
    <section id="faq" className={`${styles.section} ${styles.wrap}`}><Reveal className={styles.sectionHead}><p className={styles.eyebrow}>06 — GOOD QUESTIONS</p><h2>Frequently <em>asked.</em></h2></Reveal><div className={styles.faq}>{faqs.map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
    <section className={`${styles.finalCta} ${styles.wrap}`}><Sparkles size={20}/><p className={styles.eyebrow}>WHEN MEMORY GOES WRONG</p><h2>Give your agents<br/>a way <em>back.</em></h2><Link className={styles.buttonLight} href="/console">Open the live console <ArrowUpRight size={16}/></Link></section>
    <footer className={`${styles.footer} ${styles.wrap}`}><Link href="/" className={styles.brand}><span className={styles.brandMark} aria-hidden="true">↶</span>ctrlz</Link><span>Ctrl+Z for AI agent memory.</span><div><Link href="/console">Console</Link><a href="#how">How it works</a><a href="#faq">FAQ</a></div><small>© 2026 ctrlz</small></footer>
  </main>;
}
