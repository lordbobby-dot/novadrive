"use client";

import { motion } from "framer-motion";
import {
  Building2,
  CloudUpload,
  History,
  Search,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: CloudUpload,
    title: "Resumable, verified uploads",
    description:
      "Large files upload in chunks with checksum verification and automatic virus scanning, so nothing lands in a drive half-broken or unsafe.",
  },
  {
    icon: Search,
    title: "Search that actually finds it",
    description:
      "Full-text search across every file and folder you can access, filterable by type, tag, owner, and date.",
  },
  {
    icon: History,
    title: "Version history & trash",
    description:
      "Every file keeps its history. Restore an old version or recover something you deleted — nothing is gone until you decide it is.",
  },
  {
    icon: Users,
    title: "Sharing without the risk",
    description:
      "Invite teammates by role, or generate expiring public links. Comment threads keep feedback attached to the file, not a chat log.",
  },
  {
    icon: Building2,
    title: "Teams & organizations",
    description:
      "Workspaces, member roles, and per-organization storage quotas — built for teams that outgrow a single personal drive.",
  },
  {
    icon: Shield,
    title: "Enterprise-ready admin",
    description:
      "Full audit logs, system health dashboards, and usage analytics from one console — nothing happens without a trace.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything a growing team needs from storage
        </h2>
        <p className="mt-4 text-lg text-muted-foreground text-pretty">
          Not just a bucket for files — a complete system for how teams actually work together.
        </p>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
            className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <feature.icon className="size-5 text-primary" aria-hidden />
            </div>
            <h3 className="mt-4 font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
