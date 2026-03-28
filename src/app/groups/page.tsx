"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Group, GroupMember, Profile } from "@/lib/types";

export default function GroupsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [memberships, setMemberships] = useState<GroupMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");

  const loadData = useCallback(async () => {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }

    const [groupsResult, profilesResult, membersResult] = await Promise.all([
      supabase.from("groups").select("*"),
      supabase.from("profiles").select("*"),
      supabase.from("group_members").select("*")
    ]);

    setGroups((groupsResult.data as Group[]) ?? []);
    setProfiles((profilesResult.data as Profile[]) ?? []);
    setMemberships((membersResult.data as GroupMember[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupName || !currentUserId) return;

    await supabase.from("groups").insert({ name: groupName, created_by: currentUserId });
    setGroupName("");
    await loadData();
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGroupId || !selectedUserId) return;

    await supabase
      .from("group_members")
      .insert({ group_id: selectedGroupId, user_id: selectedUserId });
    setSelectedUserId("");
    await loadData();
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-black">Groups</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <form onSubmit={createGroup} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-black">Create group</h2>
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">Group name</label>
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} className="w-full" />
          </div>
          <button type="submit" className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
            Create group
          </button>
        </form>

        <form onSubmit={addMember} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-black">Add member</h2>
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">Group</label>
            <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} className="w-full">
              <option value="">Select group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">User</label>
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="w-full">
              <option value="">Select user</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name ?? profile.email ?? "Unknown user"}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
            Add member
          </button>
        </form>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Existing groups</h2>
        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <div key={group.id} className="rounded-xl border border-gray-200 p-4">
              <p className="font-medium text-black">{group.name}</p>
              <div className="mt-3 space-y-2">
                {memberships
                  .filter((membership) => membership.group_id === group.id)
                  .map((membership) => {
                    const member = profiles.find((profile) => profile.id === membership.user_id);
                    return (
                      <div key={membership.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                        {member?.name ?? member?.email ?? "Unknown user"}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
          {!groups.length ? <p className="text-sm text-gray-500">No groups yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
