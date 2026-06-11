"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Contact } from "@/lib/types";

export default function ContactsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  async function loadContacts() {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      setCurrentUserId(user.id);
    }

    const { data } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });

    setContacts((data as Contact[]) ?? []);
  }

  useEffect(() => {
    loadContacts();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name || !currentUserId) {
      return;
    }

    await supabase.from("contacts").insert({
      created_by: currentUserId,
      name,
      email: email || null,
      note: note || null
    });

    setName("");
    setEmail("");
    setNote("");
    await loadContacts();
  }

  async function handleDelete(contactId: string) {
    await supabase.from("contacts").delete().eq("id", contactId);
    setContacts((current) => current.filter((contact) => contact.id !== contactId));
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-black">My people</h1>
        <p className="mt-1 text-sm text-gray-500">Keep a list of contacts you split expenses with.</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Name</label>
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} className="w-full" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Note</label>
            <input value={note} onChange={(event) => setNote(event.target.value)} className="w-full" />
          </div>
        </div>
        <button type="submit" className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
          Add person
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {contacts.map((contact) => (
          <div key={contact.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-black">{contact.name}</p>
                <p className="mt-1 text-sm text-gray-500">{contact.email || "No email"}</p>
                <p className="mt-1 text-sm text-gray-500">{contact.note || "No note"}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(contact.id)}
                className="text-xl leading-none text-gray-500 hover:text-black"
              >
                ×
              </button>
            </div>
          </div>
        ))}
        {!contacts.length ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            No people added yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
