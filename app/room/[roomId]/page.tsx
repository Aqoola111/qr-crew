import { RoomPageClient } from "@/app/room/[roomId]/room-page-client";

type Props = {
  params: Promise<{ roomId: string }>;
};

export default async function RoomPage(props: Props) {
  const { roomId } = await props.params;
  return <RoomPageClient roomId={roomId} />;
}
