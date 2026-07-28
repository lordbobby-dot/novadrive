"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, File, Folder, Image, ShieldCheck, Sparkles } from "lucide-react";
import { Show, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

const MOCK_ROWS = [
  { icon: Folder, name: "Product design", meta: "12 items · Shared with 4" },
  { icon: Image, name: "Launch-hero-final.png", meta: "2.4 MB · Updated 3m ago" },
  { icon: File, name: "Q3-roadmap.pdf", meta: "890 KB · You" },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center blur-3xl"
      >
        <div className="aspect-1155/678 w-[72rem] bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent opacity-40 dark:opacity-20" />
      </div>

      <div className="mx-auto grid max-w-6xl gap-16 px-6 pt-20 pb-24 lg:grid-cols-2 lg:items-center lg:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden />
            Enterprise-grade cloud storage
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Your team&apos;s files,{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              organized and secure
            </span>
          </h1>

          <p className="mt-6 max-w-lg text-lg text-muted-foreground text-pretty">
            Upload, share, and search every file your team has — with virus scanning, full
            version history, and granular permissions built in from day one.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Show when="signed-out">
              <SignUpButton>
                <Button size="lg" className="h-11 px-6">
                  Get started free
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Button
                size="lg"
                className="h-11 px-6"
                nativeButton={false}
                render={<Link href="/drive">Go to My Drive</Link>}
              />
            </Show>
            <a
              href="#features"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              See what&apos;s included
            </a>
          </div>

          <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Every upload is virus-scanned and checksum-verified before it&apos;s visible to anyone.
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative"
        >
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/10">
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
              <span className="size-2.5 rounded-full bg-destructive/60" />
              <span className="size-2.5 rounded-full bg-chart-4/60" />
              <span className="size-2.5 rounded-full bg-chart-2/60" />
              <span className="ml-3 text-xs text-muted-foreground">app.novadrive.io/drive</span>
            </div>
            <div className="space-y-1 p-4">
              {MOCK_ROWS.map((row, i) => (
                <motion.div
                  key={row.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted"
                >
                  <row.icon className="size-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.meta}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.7 }}
            className="absolute -right-4 -bottom-4 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-lg"
          >
            <span className="size-2 animate-pulse rounded-full bg-chart-2" />
            <span className="text-xs font-medium">Synced across every device</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
