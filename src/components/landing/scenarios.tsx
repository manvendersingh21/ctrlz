"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { ArrowRight, Plane, ReceiptText, Headphones, BriefcaseBusiness, Bot } from "lucide-react";
import styles from "./landing.module.css";

type Scenario = { label: string; title: string; attack: string; response: string };
const icons = [Plane, ReceiptText, Headphones, BriefcaseBusiness, Bot];

export default function Scenarios({ scenarios }: { scenarios: Scenario[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const scenario = scenarios[active];
  if (!scenario) return null;
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = scenarios.length - 1;
    const next = event.key === "ArrowRight" ? (active === last ? 0 : active + 1) : event.key === "ArrowLeft" ? (active === 0 ? last : active - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }
  return (
    <div className={styles.scenarioBox}>
      <div className={styles.tabs} role="tablist" aria-label="Agent use cases" onKeyDown={onKeyDown}>
        {scenarios.map((item, index) => {
          const Icon = icons[index % icons.length];
          const selected = active === index;
          return (
            <button
              type="button"
              role="tab"
              id={`scenario-tab-${index}`}
              aria-controls="scenario-panel"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              ref={(el) => { tabs.current[index] = el; }}
              className={selected ? styles.activeTab : ""}
              key={item.label}
              onClick={() => setActive(index)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <article className={styles.scenarioCard} role="tabpanel" id="scenario-panel" aria-labelledby={`scenario-tab-${active}`}>
        <div className={styles.scenarioCol}><small>THE ATTACK</small><h3>{scenario.title}</h3><p>{scenario.attack}</p></div>
        <ArrowRight className={styles.scenarioArrow} aria-hidden="true" />
        <div className={styles.scenarioCol}><small>CTRLZ RESPONSE</small><p>{scenario.response}</p></div>
      </article>
    </div>
  );
}
