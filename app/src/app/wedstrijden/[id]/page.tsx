"use client";

import Link from "next/link";
import { use } from "react";

import { WedstrijdDetail } from "@/app/_components/wedstrijd-detail";

export default function WedstrijdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <main className="shell">
      <Link href="/wedstrijden" className="terug-link">← Terug naar wedstrijden</Link>
      <WedstrijdDetail idWedstrijd={Number(id)} />
    </main>
  );
}
