export type IssueOwner = {
  owner?: string | null;
  owner_alias?: string | null;
  owner_member_id?: string | null;
};

export function sameIssueOwner(a: IssueOwner, b: IssueOwner) {
  if (a.owner_member_id && b.owner_member_id && a.owner_member_id === b.owner_member_id) return true;
  // A free-text owner may later be linked to a member with the same visible alias.
  const display = (event: IssueOwner) => String(event.owner_alias || event.owner || "未指定")
    .trim().toLocaleLowerCase("zh-TW");
  return display(a) === display(b);
}

export function ownerLabelIndexes(events: IssueOwner[]) {
  return events.flatMap((event, index) =>
    index === events.length - 1 || !sameIssueOwner(event, events[index + 1]) ? [index] : []);
}
