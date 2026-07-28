"use client";

import { motion } from "framer-motion";
import { Activity, Bug, KeyRound, ScrollText, ShieldCheck, TimerReset } from "lucide-react";

const POINTS = [
  {
    icon: Bug,
    title: "Virus scanning on every upload",
    description: "Files are scanned before they're ever visible to anyone else, quarantined automatically if flagged.",
  },
  {
    icon: KeyRound,
    title: "Granular, resolvable permissions",
    description: "A single permission resolver governs every file, folder, and organization role — no ad-hoc checks scattered around.",
  },
  {
    icon: ScrollText,
    title: "Complete audit trail",
    description: "Every meaningful action is recorded and searchable — who did what, and when.",
  },
  {
    icon: TimerReset,
    title: "Rate limiting & hardened headers",
    description: "CSP, Helmet, and per-route throttling ship on by default, not bolted on after the fact.",
  },
  {
    icon: Activity,
    title: "Live health & metrics",
    description: "Structured logs, distributed tracing, and Prometheus metrics mean incidents get caught, not discovered.",
  },
  {
    icon: ShieldCheck,
    title: "Signed, time-limited file access",
    description: "Downloads and previews use short-lived signed URLs — files are never served from a public bucket.",
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Built to be trusted with your files
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Security isn&apos;t a feature we added — it&apos;s the foundation every other feature
            was built on.
          </p>
        </div>

        <div className="mt-16 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {POINTS.map((point, i) => (
            <motion.div
              key={point.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
              className="flex gap-4"
            >
              <point.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <h3 className="font-semibold">{point.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{point.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
