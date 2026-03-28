"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StatementUploader from "@/components/StatementUploader";
import { createClient } from "@/lib/supabase";
import type { Statement } from "@/lib/types";

export default function StatementsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStatements() {
      const { data } = await supabase
        .from("statements")
        .select("*")
        .order("month", { ascending: false })
        .order("created_at", { ascending: false });

      setStatements((data as Statement[]) ?? []);
      setLoading(false);
    }

    loadStatements();
  }, [supabase]);

  const groupedStatements = statements.reduce<Record<string, Statement[]>>((groups, statement) => {
    const key = statement.month;
    groups[key] = [...(groups[key] ?? []), statement];
    return groups;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black">Statements</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload statements and review parsed transactions by month.
          </p>
        </div>
        <StatementUploader />
      </div>

      {loading ? <p className="text-sm text-gray-500">Loading statements...</p> : null}

      <div className="space-y-5">
        {Object.entries(groupedStatements).map(([month, rows]) => (
          <section key={month} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-black">{month}</h2>
            <div className="mt-4 space-y-3">
              {rows.map((statement) => (
                <Link
                  key={statement.id}
                  href={`/statements/${statement.id}/review`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 transition hover:border-indigo-600"
                >
                  <div>
                    <p className="font-medium text-black">{statement.source_filename ?? "Untitled file"}</p>
                    <p className="text-sm text-gray-500">{statement.created_at.slice(0, 10)}</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-600">
                    {statement.status}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {!loading && !statements.length ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            No uploaded statements yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
