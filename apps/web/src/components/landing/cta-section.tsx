"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Show, SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card px-8 py-16 text-center sm:px-16"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
        />
        <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">
          Ready to bring your team&apos;s files somewhere they belong?
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-muted-foreground text-pretty">
          Create your first workspace in minutes — no credit card, no setup call.
        </p>
        <div className="relative mt-8 flex justify-center">
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
        </div>
      </motion.div>
    </section>
  );
}
