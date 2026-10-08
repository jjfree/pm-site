export type IssueOwner = {
  owner?: string | null;
  owner_alias?: string | null;
  owner_member_id?: string | null;
  owner_member_ids?: string[] | null;
  owner_display?: string | null;
  owner_people?: { id: string; label: string }[] | null;
};

export function issueOwnerDisplay(row: IssueOwner) {
  return row.owner_display || row.owner_people?.map((person) => person.label).join("、") ||
    row.owner_alias || row.owner || "";
}

export function issueOwnerFilters(row: IssueOwner) {
  if (row.owner_people?.length) return row.owner_people.map((person) => ({
    value: `member:${person.id}`, label: person.label,
  }));
  const ids = row.owner_member_ids?.length ? row.owner_member_ids :
    row.owner_member_id ? [row.owner_member_id] : [];
  if (ids.length) return ids.map((id) => ({ value: `member:${id}`, label: issueOwnerDisplay(row) }));
  return row.owner ? [{ value: `legacy:${row.owner}`, label: `${row.owner}（待重新指派）` }] : [];
}
