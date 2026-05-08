import { MembersPageClient } from "@/app/room/[roomId]/members/members-page-client";

type Props = {
  params: Promise<{ roomId: string }>;
};

export default async function RoomMembersPage(props: Props) {
  const { roomId } = await props.params;
  return <MembersPageClient roomId={roomId} />;
}
