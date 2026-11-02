import type { Metadata } from "next";
import Link from "next/link";
import Dashboard from "@/components/Dashboard";
import LibraryView from "@/components/LibraryView";
import { Icon } from "@/components/icons";

export const metadata: Metadata = {
  title: "My Library",
  description: "Your saved flashcard sets.",
};

export default function LibraryPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">My Library</h1>
          <p className="mt-2 text-muted">
            Saved in this browser. Use Backup or a share link to keep a copy.
          </p>
        </div>
        <Link href="/create" className="btn btn-primary">
          <Icon name="plus" size={16} />
          New set
        </Link>
      </div>
      {/* Sets first: that's what people come here for. Progress follows. */}
      <LibraryView />
      <Dashboard />
    </div>
  );
}
